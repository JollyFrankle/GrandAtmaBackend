import { Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import bcrypt from "bcrypt";

export default class UserController {
    static async indexP(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const users = await prisma.user_customer.findMany({
            where: {
                type: 'g'
            },
        })

        const usersWithoutPassword = users.map(user => {
            // @ts-ignore
            delete user.password
            return user
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mengambil data',
            data: usersWithoutPassword
        })
    }

    static async storeP(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 100
            },
            nama_institusi: {
                required: true,
                maxLength: 100
            },
            no_identitas: {
                required: true,
                maxLength: 50
            },
            jenis_identitas: {
                required: true,
                in: ['ktp', 'sim', 'paspor']
            },
            no_telp: {
                required: true,
                maxLength: 20
            },
            email: {
                required: true,
                maxLength: 100,
                type: 'email'
            },
            alamat: {
                required: true,
                maxLength: 255
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: 'Validasi gagal',
                errors: validation.errors
            }, 422)
        }

        const { nama, nama_institusi, no_identitas, jenis_identitas, no_telp, email, alamat } = validation.validated()

        // Check if email already exists
        const emailExists = await prisma.user_customer.findUnique({
            where: {
                type_email: {
                    email,
                    type: 'g'
                }
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

        const user = await prisma.user_customer.create({
            data: {
                type: 'g',
                nama,
                nama_institusi,
                no_identitas,
                jenis_identitas,
                no_telp,
                email,
                alamat,
                verified_at: new Date()
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil menambahkan data',
            data: user
        })
    }

    static async showP(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const user = await prisma.user_customer.findFirst({
            where: {
                id: +id,
                type: 'g'
            }
        })

        if (!user) {
            return ApiResponse.error(res, {
                message: 'Data tidak ditemukan',
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: 'Berhasil mengambil data',
            data: user
        })
    }

    // Customer routes
    // storeC --> Register
    static async showC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const latestUser = await prisma.user_customer.findFirst({
            where: {
                id: user.id!!,
                type: 'p'
            }
        })

        if (!latestUser) {
            return ApiResponse.error(res, {
                message: 'Data tidak ditemukan',
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: 'Berhasil mengambil data',
            data: latestUser
        })
    }

    static async updateC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 100
            },
            no_identitas: {
                required: true,
                maxLength: 50
            },
            jenis_identitas: {
                required: true,
                in: ['ktp', 'sim', 'paspor']
            },
            no_telp: {
                required: true,
                maxLength: 20
            },
            email: {
                required: true,
                maxLength: 100,
                type: 'email'
            },
            alamat: {
                required: true,
                maxLength: 255
            },
            password: {
                required: false,
                minLength: 8,
            },
            old_password: {
                required: false,
                minLength: 8,
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: 'Validasi gagal',
                errors: validation.errors
            }, 422)
        }

        const { nama, nama_institusi, no_identitas, jenis_identitas, no_telp, email, alamat, password, old_password } = validation.validated()

        // Update password (jika diisi)
        let hashedPassword: string | undefined = undefined
        let passwordLastChanged: Date | undefined = undefined
        if (password) {
            // Check old password
            const currentUser = await prisma.user_customer.findFirst({
                where: {
                    id: user.id!!,
                    type: 'p'
                }
            })
            const oldPasswordMatch = await bcrypt.compare(old_password, currentUser?.password || '')
            if (!oldPasswordMatch) {
                return ApiResponse.error(res, {
                    message: 'Password lama tidak cocok',
                    errors: {
                        old_password: 'Password lama tidak cocok'
                    }
                }, 422)
            }

            hashedPassword = await bcrypt.hash(password, 10)
            passwordLastChanged = new Date()
        }

        // Check if email already exists
        const emailExists = await prisma.user_customer.findFirst({
            where: {
                type: 'p',
                email: email,
                id: {
                    not: user.id!!
                }
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

        const updatedUser = await prisma.user_customer.update({
            where: {
                id: user.id!!
            },
            data: {
                nama,
                nama_institusi,
                no_identitas,
                jenis_identitas,
                no_telp,
                email,
                alamat,
                password: hashedPassword,
                password_last_changed: passwordLastChanged,
                updated_at: new Date()
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mengupdate data',
            data: updatedUser
        })
    }
}

// Routing
export const routerP = Router()
routerP.get('/', UserController.indexP)
routerP.get('/:id', UserController.showP)
routerP.post('/', UserController.storeP)

export const routerC = Router()
routerC.get('/', UserController.showC)
routerC.put('/', UserController.updateC)