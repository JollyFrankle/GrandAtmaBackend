import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import PrismaScope from './PrismaService'
import { JwtUserCustomer, JwtUserPegawai, UserCustomer, UserPegawai } from './Models'
import { Request } from 'express'

export default class Authentication {
    static async attemptCustomer(username: string, password: string) {
        return PrismaScope(async (prisma) => {
            const userCustomer = await prisma.user_customer.findUnique({
                where: {
                    type_email: {
                        type: 'p',
                        email: username
                    }
                }
            })

            if (userCustomer !== null && userCustomer.password !== null) {
                const isPasswordMatch = await bcrypt.compare(password, userCustomer.password);
                if (isPasswordMatch) {
                    return userCustomer
                }
            }

            return null
        })
    }

    static async attemptPegawai(username: string, password: string) {
        return PrismaScope(async (prisma) => {
            const userPegawai = await prisma.user_pegawai.findFirst({
                where: {
                    username: username
                }
            })

            if (userPegawai !== null) {
                const isPasswordMatch = await bcrypt.compare(password, userPegawai.password);
                if (isPasswordMatch) {
                    return userPegawai
                }
            }

            return null
        })
    }

    private static generateAuthToken(length: number = 64) {
        return crypto.randomBytes(length).toString('hex').substring(0, length)
    }

    static async generateTokenC(user: UserCustomer) {
        const generatedToken = this.generateAuthToken()
        const jtwToken = jwt.sign({
            user_type: 'c',
            id: user.id,
            type: user.type,
            username: user.email,
            email: user.email,
            token: generatedToken
        } as JwtUserCustomer, process.env.JWT_SECRET as string, {
            expiresIn: '7d'
        })

        const fullToken = this.verifyToken(jtwToken)

        await PrismaScope(async (prisma) => {
            await prisma.auth_tokens.create({
                data: {
                    token: generatedToken,
                    id_user: user.id,
                    user_type: 'c',
                    created_at: new Date(fullToken!!.iat!! * 1000),
                    expires_at: new Date(fullToken!!.exp!! * 1000)
                }
            })
        })

        return jtwToken
    }

    static async generateTokenP(user: UserPegawai) {
        const generatedToken = this.generateAuthToken()
        const jtwToken = jwt.sign({
            user_type: 'p',
            id: user.id,
            role: user.role,
            username: user.username,
            token: generatedToken
        } as JwtUserPegawai, process.env.JWT_SECRET as string, {
            expiresIn: '7d'
        })

        const fullToken = this.verifyToken(jtwToken)

        await PrismaScope(async (prisma) => {
            await prisma.auth_tokens.create({
                data: {
                    token: generatedToken,
                    id_user: user.id,
                    user_type: 'p',
                    created_at: new Date(fullToken!!.iat!! * 1000),
                    expires_at: new Date(fullToken!!.exp!! * 1000)
                }
            })
        })

        return jtwToken
    }

    static verifyToken<T = {}>(token: string) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string)
            return decoded as jwt.JwtPayload & T
        } catch (e) {
            return null
        }
    }

    static async revokeToken(token: string) {
        return PrismaScope(async (prisma) => {
            const updated = await prisma.auth_tokens.delete({
                where: {
                    token: token
                }
            }).catch(() => null)

            return updated !== null
        })
    }

    /**
     * Extracts the token from the Authorization header of a request.
     * @param req - The request object.
     * @returns The token as a string or null, depending on the middleware.
     * @template T - The type of the token, which could be set to `string|undefined` on the middlewares.
     */
    static token<T = string>(req: Request) {
        return req.headers.authorization?.split(" ")[1] as T
    }
}