import Settings from "./Settings"

export default class Utils {
    static JAM_CHECKIN: number
    static JAM_CHECKOUT: number

    static async init() {
        this.JAM_CHECKIN = parseInt(await Settings.get('JAM_CHECKIN') ?? '0')
        this.JAM_CHECKOUT = parseInt(await Settings.get('JAM_CHECKOUT') ?? '0')
    }

    static dateFormatFull = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'long'
    })

    static dateFormatDate = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'long'
    })

    static dateFormatTime = new Intl.DateTimeFormat('id-ID', {
        timeStyle: 'long'
    })

    static numberFormat = new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 2
    })

    static currencyFormat = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    })

    static parseJsonElseNull(json: string): any {
        try {
            return JSON.parse(json)
        } catch (e) {
            return null
        }
    }
}