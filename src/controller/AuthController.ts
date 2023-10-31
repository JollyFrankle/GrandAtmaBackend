import { Request, Response } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import bcrypt from "bcrypt";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { JwtUserCustomer, JwtUserPegawai } from "../modules/Models";
import Mail from "../modules/Mail";
import axios from "axios";

export default class AuthController {
    private static async validateRecaptcha(token: string, ip?: string): Promise<boolean> {
        const GRE_SECRET = process.env.GRE_SECRET
        if (GRE_SECRET === undefined) {
            return false
        }

        return axios.post(`https://www.google.com/recaptcha/api/siteverify?${new URLSearchParams({
            secret: GRE_SECRET,
            response: token,
            remoteip: ip || ''
        })}`).then(res => {
            if (!res.data.success) {
                console.log(new Date(), "GRE", res.data)
            }
            return res.data.success
        }).catch(_ => {
            return false
        })
    }

    static async askForRecaptchaIfNotMobile(req: Request) {
        const packageName = req.headers['x-package-name'] || ''
        if (packageName === "com.example.grandatmahotel") {
            return true
        }

        const recaptcha_token = req.body.recaptcha_token
        if (recaptcha_token === undefined) {
            return false
        }

        return AuthController.validateRecaptcha(recaptcha_token, req.ip)
    }

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

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
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

    static async loginCustomer(req: Request, res: Response) {
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

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
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

        return ApiResponse.error(res, {
            message: "Username atau password salah",
            errors: null
        }, 400)
    }

    static async loginPegawai(req: Request, res: Response) {
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

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
            }, 422)
        }

        const { username, password } = validation.validated();

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
                maxLength: 15
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
            }, 422)
        }

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
            }, 422)
        }

        const { email, password, nama, no_telp, alamat, no_identitas, jenis_identitas } = validation.validated();

        return PrismaScope(async (prisma) => {
            // Check email taken
            const emailExists = await prisma.user_customer.findFirst({
                where: {
                    type: 'p',
                    email: email
                }
            })

            if (emailExists) {
                return ApiResponse.error(res, {
                    message: 'Email sudah digunakan',
                    errors: {
                        email: 'Email sudah digunakan'
                    }
                }, 422)
            }

            const hashedPassword = await bcrypt.hash(password, 10);
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

            // Send email
            const token = await Authentication.generateTokenC(userCustomer, 'verification')
            const decodedToken = Authentication.decodeToken<JwtUserCustomer>(token)
            try {
                await Mail.sendUserActivation(userCustomer, token, new Date(decodedToken!!.exp!! * 1000))
                return ApiResponse.success(res, {
                    message: "Berhasil mendaftar. Silakan cek email Anda untuk memverifikasi akun.",
                    data: userCustomer
                }, 201)
            } catch (e) {
                return ApiResponse.error(res, {
                    message: "Gagal mengirim email verifikasi password. Silakan hubungi Admin untuk memverifikasi email Anda.",
                    errors: null
                }, 500)
            }
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

    static async confirmEmail(req: Request, res: Response) {
        const validation = Validation.body(req, {
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

        const { token } = validation.validated();

        // check token
        const decodedToken = Authentication.decodeToken<JwtUserCustomer>(token)
        if (decodedToken === null) {
            return ApiResponse.error(res, {
                message: "Token tidak valid",
                errors: null
            }, 400)
        }

        // get user
        const user = await Authentication.getUserFromToken(decodedToken, 'verification')
        if (user === null) {
            return ApiResponse.error(res, {
                message: "Token tidak valid",
                errors: null
            }, 400)
        }

        // update user
        return await PrismaScope(async (prisma) => {
            await prisma.user_customer.update({
                where: {
                    id: user.id
                },
                data: {
                    verified_at: new Date()
                }
            })

            // Delete all token
            await prisma.tokens.deleteMany({
                where: {
                    id_user: user.id,
                    intent: 'verification'
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil memverifikasi email",
                data: null
            })
        })
    }

    static async changePassword(req: Request, res: Response) {
        const { token } = req.params
        const validation = Validation.body(req, {
            password: {
                required: true,
                minLength: 8
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
            }, 422)
        }

        const { password } = validation.validated();

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

        const hashedPassword = await bcrypt.hash(password, 10);
        return await PrismaScope(async (prisma) => {
            if (decodedToken.user_type === 'c') {
                await prisma.user_customer.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        password: hashedPassword,
                        password_last_changed: new Date()
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

            return ApiResponse.success(res, {
                message: "Berhasil mengubah password",
                data: null
            })
        })
    }

    static async resetPassword(req: Request, res: Response) {
        const validation = Validation.body(req, {
            email: {
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

        const recaptchaValid = await AuthController.askForRecaptchaIfNotMobile(req)
        if (!recaptchaValid) {
            return ApiResponse.error(res, {
                message: "Recaptcha tidak valid",
                errors: {
                    recaptcha_token: "Recaptcha tidak valid"
                }
            }, 422)
        }

        const { email, type } = validation.validated();

        return await PrismaScope(async (prisma) => {
            if (type === 'c') {
                const user = await prisma.user_customer.findUnique({
                    where: {
                        type_email: {
                            type: 'p',
                            email: email
                        }
                    }
                })

                if (user === null) {
                    return ApiResponse.error(res, {
                        message: "Email tidak terdaftar",
                        errors: {
                            email: "Email tidak terdaftar"
                        }
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
                const user = await prisma.user_pegawai.findUnique({
                    where: {
                        email: email
                    }
                })

                if (user === null) {
                    return ApiResponse.error(res, {
                        message: "Email tidak terdaftar",
                        errors: {
                            email: "Email tidak terdaftar"
                        }
                    }, 400)
                }

                // Send email
                const token = await Authentication.generateTokenP(user, 'passreset')
                const decodedToken = Authentication.decodeToken<JwtUserPegawai>(token)
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
            }
        })
    }
}