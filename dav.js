const dav = require('dav')
const {v4: uuidv4} = require('uuid')

class DAVClient {
    /**
     * Simple DAV client
     * @param {string} server DAV Server URL
     * @param {string} user User name
     * @param {string} passwd Password
     */
    constructor (server, user, passwd) {
        this.url = server
        this.xhr = new dav.transport.Basic(new dav.Credentials({
            username: user,
            password: passwd
        }))
        this.client = new dav.Client(this.xhr)
        this.client.createAccount({
            server: this.url,
            accountType: 'caldav',
            loadObjects: true
        }).then(account => this.caldavAccount = account)
    }

    /**
     * Synchronise the given calendar
     * @param {dav.Calendar} calendar DAV calendar object
     */
    syncCalendar (calendar) {
        return this.client.syncCalendar(calendar)
    }

    /**
     * Get a list of existing calendars for this account
     */
    getCalendars () {
        return this.caldavAccount.calendars
    }

    /**
     * Create a new calendar event
     * @param {dav.Calendar} calendar DAV calendar object
     * @param {Object<string>} data Should contain 'summary', 'description', 'start', 'end' properties
     */
    createEvent (calendar, data) {
        let uid = uuidv4()
        const alarmValue = 'T1H'
        let eventData = 'BEGIN:VCALENDAR\n' +
                        'BEGIN:VEVENT\n' +
                        'UID:' + uid + '\n' +
                        'SUMMARY:' + data.summary + '\n' +
                        'DESCRIPTION:' + data.description + '\n' + 
                        'DTSTART;VALUE=DATE:' + data.start.replace(/-/g, '') + '\n' +
                        'DTEND;VALUE=DATE:' + data.end.replace(/-/g, '') + '\n' +
                        'BEGIN:VALARM\n' +
                        'TRIGGER;VALUE=DURATION:-P' + alarmValue + '\n' +
                        'ACTION:DISPLAY\n' +
                        'END:VALARM\n' +
                        'END:VEVENT\n' +
                        'END:VCALENDAR\n'
        return this.client.createCalendarObject(calendar, { data: eventData, filename: uid + '.ics' })
    }

    /**
     * Check if an event with given title and date exists in calendar
     * @param {dav.Calendar} calendar DAV calendar object
     * @param {Object<string>} data Should contain 'summary', 'start', 'end' properties
     */
    checkIfEventExists (calendar, data) {
        let events = calendar.objects.filter(obj => obj.calendarData.includes(data.summary))
        let found = false
        events.forEach(event => {
            let hasSameStartDate = event.calendarData.includes('DTSTART;VALUE=DATE:' + data.start.replace(/-/g, ''))
            let hasSameEndDate = event.calendarData.includes('DTEND;VALUE=DATE:' + data.end.replace(/-/g, ''))

            if (hasSameStartDate && hasSameEndDate) found = true
        })
        return found
    }
}

module.exports = DAVClient
