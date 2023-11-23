import { prisma } from "./PrismaService";


export default class Settings {
    static async get(key: string) {
        return (await prisma.settings.findUnique({
            where: {
                opt_key: key
            },
            select: {
                value: true
            }
        }))?.value!!
    }

    static async set(key: string, value: string) {
        return await prisma.settings.update({
            where: {
                opt_key: key
            },
            data: {
                value: value
                // updated at otomatis diisi
            }
        })
    }
}