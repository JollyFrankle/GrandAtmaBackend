import { Request, Response } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import bcrypt from "bcrypt";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import { CustomerOrPegawaiRequest, CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { JwtUserCustomer, JwtUserPegawai } from "../modules/Models";
import Mail from "../modules/Mail";

export default class AuthController {
    static async login(req: Request, res: Response) {
        const validation = Validation.body(req, {
            username: {
                required: true
            },
            password: {
                required: true
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { username, password } = validation.validated();

        const userCustomer = await Authentication.attemptCustomer(username, password)
        if (userCustomer !== null) {
            if (userCustomer.verified_at === null) {
                return ApiResponse.error(res, {
                    message: "Akun belum diverifikasi",
                    errors: null
                }, 400)
            } else {
                const token = await Authentication.generateTokenC(userCustomer)
                return ApiResponse.success(res, {
                    message: "Berhasil login sebagai customer",
                    data: {
                        user: userCustomer,
                        token: token
                    }
                })
            }
        }

        const userPegawai = await Authentication.attemptPegawai(username, password)
        if (userPegawai !== null) {
            const token = await Authentication.generateTokenP(userPegawai)
            return ApiResponse.success(res, {
                message: "Berhasil login sebagai pegawai",
                data: {
                    user: userPegawai,
                    token: token
                }
            })
        }

        return ApiResponse.error(res, {
            message: "Username atau password salah",
            errors: null
        }, 400)
    }

    static async register(req: Request, res: Response) {
        const validation = Validation.body(req, {
            email: {
                required: true,
                type: "email"
            },
            password: {
                required: true,
                minLength: 8
            },
            nama: {
                required: true,
                minLength: 3
            },
            no_telp: {
                required: true,
                minLength: 8,
                maxLength: 15,
                type: "number"
            },
            alamat: {
                required: true,
                minLength: 3
            },
            no_identitas: {
                required: true,
                minLength: 3,
                maxLength: 20
            },
            jenis_identitas: {
                required: true,
                minLength: 3,
                maxLength: 20
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 400)
        }

        const { email, password, nama, no_telp, alamat, no_identitas, jenis_identitas } = validation.validated();
        const hashedPassword = await bcrypt.hash(password, 10);

        return PrismaScope(async (prisma) => {
            const userCustomer = await prisma.user_customer.create({
                data: {
                    type: 'p',
                    email: email,
                    nama: nama,
                    password: hashedPassword,
                    no_telp: no_telp,
                    alamat: alamat,
                    no_identitas: no_identitas,
                    jenis_identitas: jenis_identitas
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mendaftar",
                data: userCustomer
            }, 201)
        })
    }

    static async logoutCustomer(req: CustomerRequest, res: Response) {
        const token = req.data?.token!!

        await Authentication.revokeToken(token)
        return ApiResponse.success(res, {
            message: "Berhasil logout",
            data: null
        })
    }

    static async logoutPegawai(req: PegawaiRequest, res: Response) {
        const token = req.data?.token!!

        await Authentication.revokeToken(token)
        return ApiResponse.success(res, {
            message: "Berhasil logout",
            data: null
        })
    }

    static async changePassword(req: CustomerOrPegawaiRequest, res: Response) {
        const validation = Validation.body(req, {
            new_password: {
                required: true,
                minLength: 8
            },
            token: {
                required: true
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { new_password, token } = validation.validated();

        // check token
        const decodedToken = Authentication.decodeToken<JwtUserCustomer|JwtUserPegawai>(token)
        if (decodedToken === null) {
            return ApiResponse.error(res, {
                message: "Token tidak valid",
                errors: null
            }, 400)
        }

        // get user
        const user = await Authentication.getUserFromToken(decodedToken, 'passreset')
        if (user === null) {
            return ApiResponse.error(res, {
                message: "Token tidak valid",
                errors: null
            }, 400)
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await PrismaScope(async (prisma) => {
            if (decodedToken.user_type === 'c') {
                await prisma.user_customer.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        password: hashedPassword
                    }
                })
            } else {
                await prisma.user_pegawai.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        password: hashedPassword
                    }
                })
            }

            // Delete all token
            await prisma.tokens.deleteMany({
                where: {
                    id_user: user.id,
                    intent: 'passreset'
                }
            })
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah password",
            data: null
        })
    }

    static async resetPassword(req: Request, res: Response) {
        const validation = Validation.body(req, {
            username: {
                required: true,
                type: "email"
            },
            type: {
                required: true,
                in: ['c', 'p']
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { username, type } = validation.validated();

        return await PrismaScope(async (prisma) => {
            if (type === 'c') {
                const user = await prisma.user_customer.findUnique({
                    where: {
                        type_email: {
                            type: 'p',
                            email: username
                        }
                    }
                })

                if (user === null) {
                    return ApiResponse.error(res, {
                        message: "Email tidak terdaftar",
                        errors: null
                    }, 400)
                }

                // Send email
                const token = await Authentication.generateTokenC(user, 'passreset')
                const decodedToken = Authentication.decodeToken<JwtUserCustomer>(token)
                try {
                    await Mail.sendPasswordReset(user, token, new Date(decodedToken!!.exp!! * 1000))
                    return ApiResponse.success(res, {
                        message: "Berhasil mengirim email reset password",
                        data: null
                    })
                } catch (e) {
                    return ApiResponse.error(res, {
                        message: "Gagal mengirim email reset password",
                        errors: null
                    }, 500)
                }

            } else {
                return ApiResponse.error(res, {
                    message: "Belum bisa reset password pegawai: BELUM ADA 'EMAIL' DI DATABASE",
                    errors: null
                }, 400)
            }
        })
    }
}