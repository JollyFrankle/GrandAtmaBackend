import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import bcrypt from "bcrypt";

export default class UserPegawaiController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const users = await prisma.user_pegawai.findMany()

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

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            role: {
                required: true,
                in: ['sm', 'fo', 'gm', 'owner', 'admin']
            },
            nama: {
                required: true,
                maxLength: 100
            },
            email: {
                required: true,
                maxLength: 100
            },
            password: {
                required: true,
                maxLength: 100
            }
        })

        if(validation.fails()) {
            return ApiResponse.error(res, {
                message: 'Validasi gagal',
                errors: validation.errors
            }, 422)
        }

        const { role, nama, email, password } = req.body

        const emailExists = await prisma.user_pegawai.findFirst({
            where: {
                email
            }
        })

        if(emailExists) {
            return ApiResponse.error(res, {
                message: 'Email sudah digunakan',
                errors: {
                    email: 'Email sudah digunakan'
                }
            }, 422)
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await prisma.user_pegawai.create({
            data: {
                role,
                nama,
                email,
                password: hashedPassword
            }
        })

        // @ts-ignore
        delete user.password

        return ApiResponse.success(res, {
            message: 'Berhasil menambahkan data',
            data: user
        })
    }

    static async get(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const user = await prisma.user_pegawai.findUnique({
            where: {
                id: +id
            }
        })

        if(!user) {
            return ApiResponse.error(res, {
                message: 'Data tidak ditemukan',
                errors: null
            }, 404)
        }

        // @ts-ignore
        delete user.password

        return ApiResponse.success(res, {
            message: 'Berhasil mengambil data',
            data: user
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            role: {
                required: true,
                in: ['sm', 'fo', 'gm', 'owner', 'admin']
            },
            nama: {
                required: true,
                maxLength: 100
            },
            email: {
                required: true,
                maxLength: 100
            },
            password: {
                required: false,
                maxLength: 100
            }
        })

        if(validation.fails()) {
            return ApiResponse.error(res, {
                message: 'Validasi gagal',
                errors: validation.errors
            }, 422)
        }

        const { id } = req.params
        const { role, nama, email, password } = req.body

        const emailExists = await prisma.user_pegawai.findFirst({
            where: {
                email,
                id: {
                    not: +id
                }
            }
        })

        if(emailExists) {
            return ApiResponse.error(res, {
                message: 'Email sudah digunakan',
                errors: {
                    email: 'Email sudah digunakan'
                }
            }, 422)
        }

        const user = await prisma.user_pegawai.update({
            where: {
                id: +id
            },
            data: {
                role,
                nama,
                email,
                password: password ? await bcrypt.hash(password, 10) : undefined,
                updated_at: new Date()
            }
        })

        // @ts-ignore
        delete user.password

        return ApiResponse.success(res, {
            message: 'Berhasil mengubah data',
            data: user
        })
    }

    static async delete(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        await prisma.user_pegawai.delete({
            where: {
                id: +id
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil menghapus data',
            data: null
        })
    }
}

export const router = Router()
router.get('/', UserPegawaiController.index)
router.post('/', UserPegawaiController.store)
router.get('/:id', UserPegawaiController.get)
router.put('/:id', UserPegawaiController.update)
router.delete('/:id', UserPegawaiController.delete)