export default class Utils {
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
        maximumFractionDigits: 2
    })
}