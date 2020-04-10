const fetch = require('node-fetch')

class TMDb {
    /**
     * Small TMDb API wrapper
     * @param {string} key API key from TMDb
     */
    constructor (key) {
        this.apiKey = key
        this.baseUri = 'https://api.themoviedb.org/3/'
        this.imageUri = 'https://image.tmdb.org/t/p/'
        this.language = 'en-US'
    }

    /**
     * Format the API key to use in request
     */
    addKeyToUri () {
        return '?api_key=' + this.apiKey
    }

    /**
     * Format the language to use in request
     */
    addLanguageToUri () {
        return '&language=' + this.language
    }

    /**
     * Fetch data from the given API URL
     * @param {string} url URL to request from
     */
    requestData (url) {
        return fetch(url).then(res => res.json()).then(json => json)
    }

    /**
     * Get the full link of a poster
     * @param {string} imageFilename Image / poster path
     * @param {string|Number} width Image width, e. g. 500
     */
    getImageLink (imageFilename, width) {
        if (width === 'original') return this.imageUri + width + imageFilename
        return this.imageUri + 'w' + width + imageFilename
    }

    /**
     * Search through TMDb for movies or TV shows
     * @param {string} type Type of search (movie or tv)
     * @param {string} query The search term
     * @param {string|Number} page What result page to return
     */
    search (type, query, page) {
        return new Promise((resolve, reject) => {
            let url = ''
            if (type === 'movie') url = this.baseUri + 'search/movie'
            else if (type === 'tv') url = this.baseUri + 'search/tv'

            url += this.addKeyToUri() + this.addLanguageToUri() + '&query=' + query + '&page=' + page + '&include_adult=true'

            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get details for a given TV show
     * @param {string|Number} id TMDb show ID
     */
    getTVShowDetails (id) {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'tv/' + id + this.addKeyToUri() + this.addLanguageToUri()
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get a list of shows that have an episode with an air date in the next 7 days
     */
    getTVOnTheAir () {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'tv/on_the_air' + this.addKeyToUri() + this.addLanguageToUri() + '&page=1'
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get a list of TV shows that are airing today
     */
    getTVAiringToday () {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'tv/airing_today' + this.addKeyToUri() + this.addLanguageToUri() + '&page=1' + '&timezone=DE'
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get details for a given movie
     * @param {string|Number} id TMDb movie ID
     */
    getMovieDetails (id) {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'movie/' + id + this.addKeyToUri() + this.addLanguageToUri()
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get release dates of a movie for different types (theatrical, digital, ...)
     * Types of releases:
     * 1. Premiere
     * 2. Theatrical limited
     * 3. Theatrical
     * 4. Digital
     * 5. Physical
     * 6. TV
     * @param {string|Number} id TMDb movie ID
     */
    getMovieReleases (id) {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'movie/' + id + '/release_dates' + this.addKeyToUri() + this.addLanguageToUri()
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }

    /**
     * Get upcoming movies
     */
    getMovieUpcoming () {
        return new Promise((resolve, reject) => {
            let url = this.baseUri + 'movie/upcoming' + this.addKeyToUri() + this.addLanguageToUri() + '&page=1'
            console.log(url)
            resolve(
                this.requestData(url).then(data => data)
            )
        })
    }
}

module.exports = TMDb
