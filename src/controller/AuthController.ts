import { Request, Response } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import bcrypt from "bcrypt";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";

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
            const token = await Authentication.generateTokenC(userCustomer)
            return ApiResponse.success(res, {
                message: "Berhasil login sebagai customer",
                data: {
                    user: userCustomer,
                    token: token
                }
            })
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

    static async changePasswordC(req: CustomerRequest, res: Response) {
        const user = req.data?.user!!

        const validation = Validation.body(req, {
            old_password: {
                required: true
            },
            new_password: {
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

        const { old_password, new_password } = validation.validated();

        const isPasswordMatch = await bcrypt.compare(old_password, user.password!!);

        if (!isPasswordMatch) {
            return ApiResponse.error(res, {
                message: "Password lama salah",
                errors: null
            }, 400)
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        PrismaScope(async (prisma) => {
            await prisma.user_customer.update({
                where: {
                    id: user.id
                },
                data: {
                    password: hashedPassword
                }
            })
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah password",
            data: null
        })
    }

    static async changePasswordP(req: PegawaiRequest, res: Response) {
        const user = req.data?.user!!

        const validation = Validation.body(req, {
            old_password: {
                required: true
            },
            new_password: {
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

        const { old_password, new_password } = validation.validated();

        const isPasswordMatch = await bcrypt.compare(old_password, user.password!!);

        if (!isPasswordMatch) {
            return ApiResponse.error(res, {
                message: "Password lama salah",
                errors: null
            }, 400)
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        PrismaScope(async (prisma) => {
            await prisma.user_pegawai.update({
                where: {
                    id: user.id
                },
                data: {
                    password: hashedPassword
                }
            })
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah password",
            data: null
        })
    }
}