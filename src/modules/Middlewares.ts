import { NextFunction, Request, Response } from "express";
import Authentication from "./Authentication";
import { ApiResponse } from "./ApiResponses";
import { JwtUserCustomer, JwtUserPegawai, UserCustomer, UserPegawai } from "./Models";

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
        const token = Authentication.authToken<string|undefined>(req)
        if (token === undefined) {
            return null
        }

        // Check token valid
        const decodedToken = Authentication.decodeToken<T>(token)
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

        // Get user
        const user = await Authentication.getUserFromToken(decodedToken, 'auth', 'c')
        if (user === null) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        req.data = {
            user: user as UserCustomer,
            token: decodedToken.token
        }
        next()
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

        // Get user
        const user = await Authentication.getUserFromToken(decodedToken, 'auth', 'p')
        if (user === null) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        req.data = {
            user: user as UserPegawai,
            token: decodedToken.token
        }
        next()
    }

    static async errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
        console.log(err)
        return ApiResponse.error(res, {
            message: "Internal server error",
            errors: err
        }, 500)
    }

    static async recipient(req: Request, res: Response, next: NextFunction) {
        res.setHeader("Content-Type", "application/json")
        console.log(new Date(), req.method, req.url)
        // delay 500ms
        // setTimeout(() => {
            next()
        // }, 500)
        // next()
    }

    static async notFound(_: Request, res: Response, __: NextFunction) {
        return ApiResponse.error(res, {
            message: "Not found",
            errors: null
        }, 404)
    }
}