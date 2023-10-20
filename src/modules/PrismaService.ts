import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient()
/**
 * Executes a callback function with a new instance of PrismaClient and disconnects it afterwards.
 * @param onClientReady - The callback function to execute with the PrismaClient instance.
 * @returns A Promise that resolves when the callback function has finished executing and the PrismaClient has been disconnected.
 */
export default async function PrismaScope<T=any>(onClientReady: (prisma: PrismaClient) => Promise<T>) {
    const result = onClientReady(prisma).catch(e => {
        throw e
    })
    await prisma.$disconnect()
    return result
}