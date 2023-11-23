import moment from "moment"
import { prisma } from "./PrismaService"

export async function generateIdBooking(prefix: 'G' | 'P', bookingDate: Date) {
    const bookingPrefix = prefix + moment(bookingDate).format("DDMMYY") + '-' // i.e: G051123-
    const lastId = await prisma.reservasi.findFirst({
        where: {
            id_booking: {
                startsWith: bookingPrefix
            }
        },
        orderBy: {
            id_booking: "desc"
        },
        select: {
            id_booking: true
        }
    })

    let newIdNumber = 1
    if (lastId) {
        const lastIdNumber = parseInt(lastId.id_booking!!.substring(bookingPrefix.length))
        newIdNumber = lastIdNumber + 1
    }

    const newId = bookingPrefix + newIdNumber.toString().padStart(3, "0")
    return newId
}

export async function generateIdInvoice(prefix: 'G' | 'P') {
    const bookingPrefix = prefix + moment().format("DDMMYY") + '-' // i.e: G051123-
    const lastId = await prisma.invoice.findFirst({
        where: {
            no_invoice: {
                startsWith: bookingPrefix
            }
        },
        orderBy: {
            no_invoice: "desc"
        },
        select: {
            no_invoice: true
        }
    })

    let newIdNumber = 1
    if (lastId) {
        const lastIdNumber = parseInt(lastId.no_invoice.substring(bookingPrefix.length))
        newIdNumber = lastIdNumber + 1
    }

    const newId = bookingPrefix + newIdNumber.toString().padStart(3, "0")
    return newId
}