const TMDb = require('./api')
const api_key = require('./key')
const DAVClient = require('./dav')

/**
 * Sleep for x milliseconds
 * @param {Number} ms Milliseconds to wait
 */
function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

class TVspotter {
    /**
     * Track movie and TV show releases via calendar reminders
     * @param {string} davServerUrl URL of the CalDAV server
     * @param {string} davUser CalDAV user name
     * @param {string} davPassword CalDAV user password
     */
    constructor (davServerUrl, davUser, davPassword) {
        this.api = new TMDb(api_key)
        this.client = new DAVClient(
            davServerUrl,
            davUser,
            davPassword
        )
        sleep(2000).then(() => this.calTvspotter = this.client.getCalendars().filter(obj => obj.displayName === 'TVspotter')[0])
    }

    /**
     * Check if a date is in defined range of another date
     * @param {string|Date} dateNow Current date in YYYY-MM-DD
     * @param {string} dateTarget Date in question in YYYY-MM-DD
     * @param {Number} maxDifference Days left / When is it close?
     */
    isReleaseClose (dateNow, dateTarget, maxDifference) {
        let now = null
        if (dateNow instanceof Date) now = dateNow
        else now = new Date(dateNow)

        let target = new Date(dateTarget)
        let difference = Math.round((target - now) / (1000 * 60 * 60 * 24))
        console.log(difference)

        return {
            isClose: (difference <= maxDifference),
            difference: difference
        }
    }

    /**
     * Convert a returned item from API search to web payload
     * @param {Object} item API result item
     * @param {string|Number} posterWidth poster pixel width
     * @param {string|Number} backdropWidth backdrop pixel width
     */
    formSearchPayload (item, posterWidth='original', backdropWidth='original') {
        let fullPosterPath = api.getImageLink(item.poster_path, posterWidth)
        let fullBackdropPath = api.getImageLink(item.backdrop_path, backdropWidth)
        let tmdbId = item.id
        
        let firstRelease = null
        if (typeof item.first_air_date !== 'undefined') firstRelease = item.first_air_date
        else if (typeof item.release_date !== 'undefined') firstRelease = item.release_date

        let name = null
        if (typeof item.name !== 'undefined') name = item.name
        else if (typeof item.title !== 'undefined') name = item.title

        let originalName = null
        if (typeof item.original_name !== 'undefined') originalName = item.original_name
        else if (typeof item.original_title !== 'undefined') originalName = item.original_title

        return {
            id: tmdbId,
            name: name,
            originalName: originalName,
            firstRelease: firstRelease,
            poster: fullPosterPath,
            backdrop: fullBackdropPath
        }
    }

    /**
     * Search through TMDb for movies or TV shows
     * @param {string} type Type of search (movie or tv)
     * @param {string} query The search term
     * @param {string|Number} page What result page to return
     */
    search (type, query, page) {
        return new Promise((resolve, reject) => {
            resolve(
                api.search(type, query, page).then(results => {
                    let items = []
                    results.results.forEach(result => {
                        items.push(formSearchPayload(result))
                    })

                    return {
                        resultCount: results.total_results,
                        pages: results.total_pages,
                        items: items
                    }
                })
            )
        })
    }

    /**
     * Check if and when a show releases the next episode and set events if necessary
     * @param {string|Number} id TMDb show ID
     * @param {Number} maxDaysDifference Days left / When is it close?
     * @param {boolean} waitBeforeCalEvent If true (default), waits for 2s before continuing to ensure an established connection with the server
     * @returns {Object<string>} Status ('ended', 'released', 'close' + days left, 'none' + days left) and number of next episode (like S01E01)
     */
    checkTV (id, maxDaysDifference, waitBeforeCalEvent=true) {
        return new Promise((resolve, reject) => {
            resolve(
                this.api.getTVShowDetails(id).then(details => {
                    if (!details.in_production) {
                        return {
                            status: 'ended',
                            nextEpisode: ''
                        }
                    }
                    
                    let now = new Date()
                    let isClose = this.isReleaseClose(now, details.next_episode_to_air.air_date, maxDaysDifference)
                    let status = ''
                    let nextEpisode = 'S' + details.next_episode_to_air.season_number.toString().padStart(2, '0') + 'E' + details.next_episode_to_air.episode_number.toString().padStart(2, '0')

                    if (isClose.isClose && isClose.difference < 0) {
                        status = 'already-released'
                        this.setCalNotification(details.name + ' [' + nextEpisode + ']', status, now.toISOString().split('T')[0], waitBeforeCalEvent)
                    }
                    else if (isClose.isClose) {
                        status = 'close,' + isClose.difference
                        this.setCalNotification(details.name + ' [' + nextEpisode + ']', status, details.next_episode_to_air.air_date, waitBeforeCalEvent)
                    }
                    else {
                        status = 'none,' + isClose.difference
                    }

                    return {
                        status: status,
                        nextEpisode: nextEpisode
                    }
                })
            )
        })
    }

    /**
     * Check when a movie releases and set events if necessary
     * @param {string|Number} id TMDb movie ID
     * @param {Number} maxDaysDifference Days left / When is it close?
     * @param {boolean} waitBeforeCalEvent If true (default), waits for 2s before continuing to ensure an established connection with the server
     */
    checkMovie (id, maxDaysDifference, waitBeforeCalEvent=true) {
        return new Promise((resolve, reject) => {
            let intermedResult = {}
            resolve(
                this.api.getMovieDetails(id).then(details => {
                    intermedResult.details = details
                    return this.api.getMovieReleases(id)
                }).then(releases => {
                    let filteredReleases = releases.results.filter(res => res.iso_3166_1 === 'US')
                    if (!filteredReleases.length) {
                        filteredReleases = releases.results.filter(res => res.iso_3166_1 === 'DE')
                        if (!filteredReleases.length) throw 'No releases for US or DE found!'
                    }

                    let theatrical = filteredReleases[0].release_dates.filter(rel => rel.type === 3)
                    let digitalPhysical = filteredReleases[0].release_dates.filter(rel => rel.type === 5)
                    if (!digitalPhysical.length) {
                        digitalPhysical = filteredReleases[0].release_dates.filter(rel => rel.type === 4)
                    }

                    let now = new Date()
                    let isClose = null
                    let status = ''
                    if (theatrical.length) {
                        let date = theatrical[0].release_date.substring(0, theatrical[0].release_date.lastIndexOf('T'))
                        isClose = this.isReleaseClose(now, date, maxDaysDifference)

                        if (isClose.isClose && isClose.difference < 0) {
                            status = 'theatrical-already-released'
                            this.setCalNotification(intermedResult.details.title, status, now.toISOString().split('T')[0], waitBeforeCalEvent)
                        }
                        else if (isClose.isClose) {
                            status = 'theatrical-close,' + isClose.difference
                            this.setCalNotification(intermedResult.details.title, status, date, waitBeforeCalEvent)
                        }
                        else {
                            status = 'theatrical-none,' + isClose.difference
                        }
                    }

                    if (digitalPhysical.length) {
                        let date = digitalPhysical[0].release_date.substring(0, digitalPhysical[0].release_date.lastIndexOf('T'))
                        isClose = this.isReleaseClose(now, date, maxDaysDifference)

                        if (isClose.isClose && isClose.difference < 0) {
                            status = 'digitalPhysical-already-released'
                            this.setCalNotification(intermedResult.details.title, status, now.toISOString().split('T')[0], waitBeforeCalEvent)
                        }
                        else if (isClose.isClose) {
                            status = 'digitalPhysical-close,' + isClose.difference
                            this.setCalNotification(intermedResult.details.title, status, date, waitBeforeCalEvent)
                        }
                        else {
                            status = 'digitalPhysical-none,' + isClose.difference
                        }
                    }

                    return {
                        status: status
                    }
                })
            )
        })
    }

    /**
     * Creates an event with a reminder in the CalDAV calendar
     * @param {string} title Title of the calendar event
     * @param {string} description Description of the event
     * @param {string} date Date of the event (YYYY-MM-DD)
     * @param {boolean} doInitialWait If true (default), waits for 2s before continuing to ensure an established connection with the server
     */
    setCalNotification (title, description, date, doInitialWait=true) {
        let wait = 2000
        if (!doInitialWait) wait = 1

        sleep(wait).then(() => {
            // refresh calendar
            this.client.syncCalendar(this.calTvspotter).then(result => {
                this.calTvspotter = result
            })

            let data = {
                summary: title,
                description: description,
                start: date,
                end: date
            }

            // if not existing, create event
            if (!this.client.checkIfEventExists(this.calTvspotter, data)) {
                this.client.createEvent(this.calTvspotter, data).then(result => {
                    if (result.request.status !== 201) throw 'Couldnt create event!'
                })
            }
        })
    }
}


let spotter = new TVspotter('', '', '')
spotter.checkMovie(502425, 4).then(data => console.log(data))

// TODO: do something with these:
// api.getTVOnTheAir().then(data => console.log(data))
// api.getTVAiringToday().then(data => console.log(data))
// api.getMovieUpcoming().then(data => console.log(data))


//search('movie', "The Hitman's Wife's Bodyguard", 1).then(data => console.log(data))

//checkTV(60059, 4).then(data => console.log(data))
