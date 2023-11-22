export default class Utils {
    static JAM_CHECK_IN = 14
    static JAM_CHECK_OUT = 12

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