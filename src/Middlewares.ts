import { NextFunction, Request, Response } from "express";
import Authentication from "./modules/Authentication";
import { ApiResponse } from "./modules/ApiResponses";
import { JwtUserCustomer, JwtUserPegawai, UserCustomer, UserPegawai } from "./modules/Models";
import PrismaScope from "./modules/PrismaService";

export interface CustomerOrPegawaiRequest extends Request {
    data?: {
        user: UserCustomer|UserPegawai;
        token: string;
    }
}

export interface CustomerRequest extends Request {
    data?: {
        user: UserCustomer;
        token: string;
    }
}

export interface PegawaiRequest extends Request {
    data?: {
        user: UserPegawai;
        token: string;
    }
}

export default class Middlewares {

    private static getDecodedToken<T>(req: Request) {
        // Check token exists
        const token = Authentication.token<string|undefined>(req)
        if (token === undefined) {
            return null
        }

        // Check token valid
        const decodedToken = Authentication.verifyToken<T>(token)
        if (decodedToken === null) {
            return null
        }

        return decodedToken
    }

    static async customer(req: CustomerRequest, res: Response, next: NextFunction) {
        // Get decoded token
        const decodedToken = Middlewares.getDecodedToken<JwtUserCustomer>(req)
        if (!decodedToken) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        // Check user exists
        return PrismaScope(async (prisma) => {
            const tokenValid = await prisma.auth_tokens.findFirst({
                where: {
                    token: decodedToken.token,
                    revoked: 0
                }
            })

            if (tokenValid === null) {
                return ApiResponse.error(res, {
                    message: "Unauthorized",
                    errors: null
                }, 401)
            }

            const user = await prisma.user_customer.findUnique({
                where: {
                    id: decodedToken.id,
                    // enabled: 1
                }
            })

            if (user === null) {
                return ApiResponse.error(res, {
                    message: "Unauthorized",
                    errors: null
                }, 401)
            }

            req.data = {
                user: user,
                token: decodedToken.token
            }
            next()
        })
    }

    static async pegawai(req: PegawaiRequest, res: Response, next: NextFunction) {
        // Get decoded token
        const decodedToken = Middlewares.getDecodedToken<JwtUserPegawai>(req)
        if (!decodedToken) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        // Check user exists
        return PrismaScope(async (prisma) => {
            const tokenValid = await prisma.auth_tokens.findFirst({
                where: {
                    token: decodedToken.token,
                    revoked: 0
                }
            })

            if (tokenValid === null) {
                return ApiResponse.error(res, {
                    message: "Unauthorized",
                    errors: null
                }, 401)
            }

            const user = await prisma.user_pegawai.findUnique({
                where: {
                    id: decodedToken.id,
                    // enabled: 1
                }
            })

            if (user === null) {
                return ApiResponse.error(res, {
                    message: "Unauthorized",
                    errors: null
                }, 401)
            }

            req.data = {
                user: user,
                token: decodedToken.token
            }
            next()
        })
    }

    static async errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
        console.log(err)
        return ApiResponse.error(res, {
            message: "Internal server error",
            errors: err
        }, 500)
    }

    static async cors(req: Request, res: Response, next: NextFunction) {
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
        console.log(new Date(), req.method, req.url)
        next()
    }

    static async notFound(req: Request, res: Response, next: NextFunction) {
        return ApiResponse.error(res, {
            message: "Not found",
            errors: null
        }, 404)
    }
}