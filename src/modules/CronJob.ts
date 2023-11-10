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