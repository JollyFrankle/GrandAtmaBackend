import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import PrismaScope from './PrismaService'
import { JwtUserCustomer, JwtUserPegawai, UserCustomer, UserPegawai } from './Models'
import { Request, Response } from 'express'
import { PegawaiRequest } from './Middlewares'
import { ApiResponse } from './ApiResponses'

export default class Authentication {
    static async excludePassword(user: UserCustomer | UserPegawai) {
        delete user.password
    }

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
                    email: username
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

    static generateAuthToken(length: number = 36) {
        return bcrypt.hashSync(new Date().getTime().toString(), 10).substring(0, length)
    }

    static async generateTokenC(user: UserCustomer, intent: JwtUserCustomer["intent"] = 'auth', expiresIn: string | number = '7d') {
        const generatedToken = Authentication.generateAuthToken()
        const jtwToken = jwt.sign({
            user_type: 'c',
            id: user.id,
            type: user.type,
            username: user.email,
            email: user.email,
            token: generatedToken
        } as JwtUserCustomer, process.env.JWT_SECRET as string, {
            expiresIn: expiresIn
        })

        const fullToken = Authentication.decodeToken(jtwToken)

        await PrismaScope(async (prisma) => {
            await prisma.tokens.create({
                data: {
                    token: generatedToken,
                    id_user: user.id!!,
                    user_type: 'c',
                    intent: intent,
                    created_at: new Date(fullToken!!.iat!! * 1000),
                    expires_at: new Date(fullToken!!.exp!! * 1000)
                }
            })
        })

        return jtwToken
    }

    static async generateTokenP(user: UserPegawai, intent: JwtUserCustomer["intent"] = 'auth', expiresIn: string | number = '7d') {
        const generatedToken = Authentication.generateAuthToken()
        const jtwToken = jwt.sign({
            user_type: 'p',
            id: user.id,
            role: user.role,
            email: user.email,
            token: generatedToken
        } as JwtUserPegawai, process.env.JWT_SECRET as string, {
            expiresIn: expiresIn
        })

        const fullToken = Authentication.decodeToken(jtwToken)

        await PrismaScope(async (prisma) => {
            await prisma.tokens.create({
                data: {
                    token: generatedToken,
                    id_user: user.id!!,
                    user_type: 'p',
                    intent: intent,
                    created_at: new Date(fullToken!!.iat!! * 1000),
                    expires_at: new Date(fullToken!!.exp!! * 1000)
                }
            })
        })

        return jtwToken
    }

    static decodeToken<T = {}>(token: string) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string)
            return decoded as jwt.JwtPayload & T
        } catch (e) {
            return null
        }
    }

    static async getUserFromToken(decodedToken: JwtUserCustomer | JwtUserPegawai, intent: JwtUserCustomer["intent"] = 'auth') {
        return PrismaScope(async (prisma) => {
            const tokenValid = await prisma.tokens.findFirst({
                where: {
                    token: decodedToken.token,
                    revoked: 0,
                    expires_at: {
                        gte: new Date()
                    },
                    intent: intent
                }
            })

            if (tokenValid === null) {
                return null
            }

            // Check in customer or pegawai
            let user: UserCustomer | UserPegawai | null = null
            if (tokenValid.user_type === 'c') {
                user = await prisma.user_customer.findUnique({
                    where: {
                        id: tokenValid.id_user,
                        // enabled: 1
                    }
                })
            } else {
                user = await prisma.user_pegawai.findUnique({
                    where: {
                        id: tokenValid.id_user,
                        // enabled: 1
                    }
                })
            }

            return user
        })
    }

    static async revokeToken(token: string) {
        return PrismaScope(async (prisma) => {
            const updated = await prisma.tokens.delete({
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
    static authToken<T = string>(req: Request) {
        return req.headers.authorization?.split(" ")[1] as T
    }

    static authorization(req: PegawaiRequest, allowedRoles: UserPegawai["role"][]) {
        const user = req.data!!.user

        if (!allowedRoles.includes(user.role)) {
            return false
        }

        return true
    }

    static defaultUnauthorizedResponse(res: Response) {
        return ApiResponse.error(res, {
            message: "Anda tidak memiliki akses ke halaman ini. Insiden ini telah dicatat.",
            errors: null
        }, 403)
    }
}