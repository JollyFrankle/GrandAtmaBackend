import { prisma } from "./PrismaService";

export default class CronJob {
    private static async cronUpdateStatusReservasi() {
        // Set status reservasi yang tak kunjung selesai menjadi expired
        await prisma.reservasi.updateMany({
            where: {
                status: {
                    startsWith: "pending-"
                },
                tanggal_dl_booking: {
                    lt: new Date()
                }
            },
            data: {
                status: "expired"
            }
        })

        // Set status reservasi yang sudah lunas tetapi belum check in juga sampai jam check out menjadi batal
        const jamCheckOut = 12 // time zone = WIB (dari process.env)
        let date = new Date() // today
        if (date.getHours() < jamCheckOut) {
            date.setDate(date.getDate() - 1) // yesterday
        }
        date.setHours(jamCheckOut, 0, 0, 0) // set to jamCheckOut

        await prisma.reservasi.updateMany({
            where: {
                status: {
                    in: ["dp", "lunas"]
                },
                checked_in: null,
                departure_date: {
                    lt: date
                }
            },
            data: {
                status: "batal"
            }
        })
    }

    private static async execute() {
        const __START__ = Date.now();
        await CronJob.cronUpdateStatusReservasi();
        const __END__ = Date.now();

        console.log(new Date(), "CRONJOB", "DONE", __END__ - __START__ + "ms")
    }

    private static async schedule() {
        const msBeforeNextHour = 60 * 60 * 1000 - (Date.now() % (60 * 60 * 1000));
        setTimeout(async () => {
            await CronJob.execute();
            await CronJob.schedule();
        }, msBeforeNextHour)
    }

    static async run() {
        // Initial run
        await CronJob.execute();

        // Schedule next run
        await CronJob.schedule();
    }
}