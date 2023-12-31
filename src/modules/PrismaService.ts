import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient()

// export function exclude<T>(obj: T, exclude: (keyof T)[]):
//     const result: { [K in keyof T]: boolean } = {} as { [K in keyof T]: boolean }
//     for (const key in obj) {
//         if (!exclude.includes(key as keyof T)) {
//             result[key] = true
//         }
//     }
//     return result
// }
/**
 * Executes a callback function with a new instance of PrismaClient and disconnects it afterwards.
 * @param onClientReady - The callback function to execute with the PrismaClient instance.
 * @returns A Promise that resolves when the callback function has finished executing and the PrismaClient has been disconnected.
 */
async function PrismaScope<T=any>(onClientReady: (prisma: PrismaClient) => Promise<T>) {
    const result = onClientReady(prisma).catch(e => {
        throw e
    })
    await prisma.$disconnect()
    return result
}