const path = require('path')
const TMDb = require('./api')
const api_key = require('./key')
const DAVClient = require('./dav')
const DAO = require('./DBmngr/dao')
const SQLiteWriter = require('./DBmngr/sqliteWriter')
const SQLiteReader = require('./DBmngr/sqliteReader')

const dbName = path.resolve(__dirname, 'tvspotter.db')
const tableMovies = 'movies'
const tableTV = 'tv'

/**
 * Sleep for x milliseconds
 * @param {Number} ms Milliseconds to wait
 */
function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get columns to use in movies table
 */
function getColsMovies () {
    return {
        names: [
            'tmdbId',
            'name',
            'originalName',
            'firstRelease',
            'theatricalRelease',
            'digitalPhysicalRelease',
            'poster',
            'backdrop',
            'status'
        ],
        types: [
            'INTEGER',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'INTEGER'
        ]
    }
}

/**
 * Get columsn to use in tv table
 */
function getColsTV () {
    return {
        names: [
            'tmdbId',
            'name',
            'originalName',
            'firstRelease',
            'nextRelease',
            'nextEpisode',
            'poster',
            'backdrop',
            'status'
        ],
        types: [
            'INTEGER',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'TEXT',
            'INTEGER'
        ]
    }
}

class TVspotter {
    /**
     * Track movie and TV show releases via calendar reminders
     * @param {string} davServerUrl URL of the CalDAV server
     * @param {string} davUser CalDAV user name
     * @param {string} davPassword CalDAV user password
     * @param {string} lang Language code to use, default en-US
     */
    constructor (davServerUrl, davUser, davPassword, lang='en-US') {
        this.api = new TMDb(api_key, lang)
        this.client = new DAVClient(
            davServerUrl,
            davUser,
            davPassword
        )
        sleep(3000).then(() => this.calTvspotter = this.client.getCalendars().filter(obj => obj.displayName === 'TVspotter')[0])
        this.writer = new SQLiteWriter(new DAO(dbName, 'CW'))
        this.writer.setWalMode()
        this.closeDb()
        sleep(1000).then(() => this.reader = new SQLiteReader(new DAO(dbName, 'RO')))
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

        return {
            isClose: (difference <= maxDifference),
            difference: difference
        }
    }

    /**
     * Convert a raw status to an integer code
     * Returns:
     * -1   if nothing fitting found |
     *  0   tv ended |
     *  10  tv released |
     *  20x tv close (x=difference) |
     *  30x tv none (x=difference) |
     *  11  movie theat released |
     *  12  movie dig released |
     *  21x movie theat close |
     *  22x movie dig close |
     *  31x movie theat none |
     *  32x movie dig none |
     * @param {string} mode tv or movie
     * @param {string} raw Can be 'ended', 'already-released', 'close,X' or 'none,X'  (X is difference) for TV
     *                     or 'theatrical-' / 'digitalPhysical-' following same as for TV for movies
     */
    encodeStatus (mode, raw) {
        let status = -1
        let difference = ''
        if (mode === 'tv') {
            switch (true) {
                case raw === 'ended':
                    status = 0
                    break
                case raw === 'already-released':
                    status = 10
                    break
                case /^close/.test(raw):
                    status = 20
                    difference = raw.split('close,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                case /^none/.test(raw):
                    status = 30
                    difference = raw.split('none,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                default:
                    break
            }
        }
        else if (mode === 'movie') {
            switch (true) {
                case raw === 'theatrical-already-released':
                    status = 11
                    break
                case raw === 'digitalPhysical-already-released':
                    status = 12
                    break
                case /^theatrical-close/.test(raw):
                    status = 21
                    difference = raw.split('theatrical-close,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                case /^digitalPhysical-close/.test(raw):
                    status = 22
                    difference = raw.split('digitalPhysical-close,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                case /^theatrical-none/.test(raw):
                    status = 31
                    difference = raw.split('theatrical-none,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                case /^digitalPhysical-none/.test(raw):
                    status = 32
                    difference = raw.split('digitalPhysical-none,')[1]
                    status *= (10 ** difference.length)
                    status += Number(difference)
                    break
                default:
                    break
            }
        }
        return status
    }

    /**
     * Convert a returned item from API search to web payload
     * @param {Object} item API result item
     * @param {string|Number} posterWidth poster pixel width
     * @param {string|Number} backdropWidth backdrop pixel width
     */
    formSearchPayload (item, posterWidth='original', backdropWidth='original') {
        let fullPosterPath = this.api.getImageLink(item.poster_path, posterWidth)
        let fullBackdropPath = this.api.getImageLink(item.backdrop_path, backdropWidth)
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
                this.api.search(type, query, page).then(results => {
                    let items = []
                    results.results.forEach(result => {
                        items.push(this.formSearchPayload(result))
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
     * Get a list of shows that have an episode with an air date in the next 7 days
     */
    getTVOnTheAir () {
        return new Promise((resolve, reject) => {
            resolve(
                this.api.getTVOnTheAir().then(results => {
                    let items = []
                    results.results.forEach(result => {
                        items.push(this.formSearchPayload(result))
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
     * Get a list of shows that have an episode airing today
     */
    getTVAiringToday () {
        return new Promise((resolve, reject) => {
            resolve(
                this.api.getTVAiringToday().then(results => {
                    let items = []
                    results.results.forEach(result => {
                        items.push(this.formSearchPayload(result))
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
     * Get upcoming movies
     */
    getMovieUpcoming () {
        return new Promise((resolve, reject) => {
            resolve(
                this.api.getMovieUpcoming().then(results => {
                    let items = []
                    results.results.forEach(result => {
                        items.push(this.formSearchPayload(result))
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
                            tmdbId: id,
                            name: details.name,
                            originalName: details.original_name,
                            firstRelease: details.first_air_date,
                            nextRelease: '',
                            nextEpisode: '',
                            poster: this.api.getImageLink(details.poster_path, 'original'),
                            backdrop: this.api.getImageLink(details.backdrop_path, 'original'),
                            status: this.encodeStatus('tv', 'ended')
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
                        tmdbId: id,
                        name: details.name,
                        originalName: details.original_name,
                        firstRelease: details.first_air_date,
                        nextRelease: details.next_episode_to_air.air_date,
                        nextEpisode: nextEpisode,
                        poster: this.api.getImageLink(details.poster_path, 'original'),
                        backdrop: this.api.getImageLink(details.backdrop_path, 'original'),
                        status: this.encodeStatus('tv', status)
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
                    else {
                        theatrical = [{ release_date: 'T' }]
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
                    else {
                        digitalPhysical = [{ release_date: 'T' }]
                    }

                    return {
                        tmdbId: id,
                        name: intermedResult.details.title,
                        originalName: intermedResult.details.original_title,
                        firstRelease: intermedResult.details.release_date,
                        theatricalRelease: theatrical[0].release_date.substring(0, theatrical[0].release_date.lastIndexOf('T')),
                        digitalPhysicalRelease: digitalPhysical[0].release_date.substring(0, digitalPhysical[0].release_date.lastIndexOf('T')),
                        poster: this.api.getImageLink(intermedResult.details.poster_path, 'original'),
                        backdrop: this.api.getImageLink(intermedResult.details.backdrop_path, 'original'),
                        status: this.encodeStatus('movie', status)
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

    /**
     * Open a new database connection
     */
    openDb () {
        this.writer = new SQLiteWriter(new DAO(dbName, 'CW'))
    }

    /**
     * Close database connection
     */
    closeDb () {
        this.writer.closeDb()
    }

    /**
     * Set up the database tables
     */
    initDb () {
        this.openDb()
        this.writer.serialize()
        this.writer.dropTable(tableMovies)
        this.writer.dropTable(tableTV)

        const colsMovies = getColsMovies()
        const colsTV = getColsTV()
        this.writer.createTable(tableMovies, colsMovies.names, colsMovies.types)
        this.writer.createTable(tableTV, colsTV.names, colsTV.types)
        this.closeDb()
    }

    /**
     * Initialise the database with all needed tables
     * @param {boolean} doReset True => delete the db tables and recreate
     */
    initialise (doReset=false) {
        let sleepFor = 1
        if (doReset) {
            this.initDb()
            sleepFor = 2000
        }
        // wait a bit to make sure it is done creating (if newly created)
        return sleep(sleepFor)
    }

    /**
     * Store given information in the database
     * @param {string} table Table name
     * @param {Array<string>} cols Names of the table columns
     * @param {Array|Object} data Data to write
     */
    storeGeneric (table, cols, data) {
        this.openDb()
        if (Array.isArray(data)) {
            let dataToWrite = []
            data.forEach(element => {
                dataToWrite.push(Object.values(element))
            })
            this.writer.insertMultipleRows(table, cols, dataToWrite)
        }
        else {
            this.writer.insertRow(table, cols, Object.values(data))
        }
        this.closeDb()
    }

    /**
     * Store a list of movies / a movie in the database
     * @param {Array|Object} data Movies to store
     */
    storeMovies (data) {
        this.storeGeneric(tableMovies, getColsMovies().names, data)
    }

    /**
     * Store a list of TV shows / a TV show in the database
     * @param {Array|Object} data TV shows to store
     */
    storeTV (data) {
        this.storeGeneric(tableTV, getColsTV().names, data)
    }

    /**
     * Read rows from a database table
     * @param {string} table Table name
     * @param {Array<string>} cols Names of the table columns
     * @param {Number} rowCount Max number of rows to return
     * @param {string} order ASC or DESC
     */
    readGeneric (table, cols, rowCount=0, order='ASC') {
        return this.reader.readAllRows(
            table,
            cols,
            {
                orderBy: 'id',
                orderOrientation: order
            }
        ).then(data => {
            if (rowCount > 0) {
                return data.slice(0, rowCount)
            }
            return data
        })
    }

    /**
     * Read movies from the database
     * @param {Number} rowCount Max number of movies to return
     * @param {string} order ASC or DESC
     */
    readMovies (rowCount=0, order='ASC') {
        return this.readGeneric(tableMovies, getColsMovies().names, rowCount, order)
    }

    /**
     * Read TV shows from the database
     * @param {Number} rowCount Max number of shows to return
     * @param {string} order ASC or DESC
     */
    readTV (rowCount=0, order='ASC') {
        return this.readGeneric(tableTV, getColsTV().names, rowCount, order)
    }

    /**
     * Check if a movie or show is already stored in the database
     * @param {Number} tmdbId TMDb item ID
     * @param {string} mode movie or tv
     */
    checkIfStored (tmdbId, mode) {
        return new Promise((resolve, reject) => {
            let result = false
            if (mode === 'movie') {
                this.readMovies().then(data => {
                    if (data.filter(obj => obj.tmdbId.toString() === tmdbId.toString()).length) {
                        result = true
                    }
                    resolve(result)
                })
            }
            else if (mode === 'tv') {
                this.readTV().then(data => {
                    if (data.filter(obj => obj.tmdbId.toString() === tmdbId.toString()).length) {
                        result = true
                    }
                    resolve(result)
                })
            }
            else reject('No valid mode given.')
        })
    }
}

module.exports = TVspotter
