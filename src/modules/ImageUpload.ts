import Jimp from "jimp"
import fs from "fs"
import multer from "multer"
import { prisma } from "./PrismaService"
import Authentication from "./Authentication"

const UPLOAD_PATH = __dirname + "/../../uploads/"
export const multerUploadDest = multer({ dest: UPLOAD_PATH })

interface UploadOK {
    success: true,
    data: {
        uid: string,
        data: Buffer,
        created_at: Date
    }
}

interface UploadError {
    success: false,
    errors: {
        [key: string]: any
    }
}

export default class ImageUpload {

    static async handlesingleUpload(errorKey: string, file?: Express.Multer.File): Promise<UploadOK | UploadError> {
        if (file === undefined) {
            return {
                success: false,
                errors: {
                    [errorKey]: "File tidak ditemukan"
                }
            }
        }

        const { mimetype, path, originalname } = file

        if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
            return {
                success: false,
                errors: {
                    [errorKey]: "File harus berupa gambar"
                }
            }
        }

        const compressedImage = await this.compressAndStoreImageInDb(path, errorKey)
        // Delete file
        fs.unlinkSync(path)

        if (!compressedImage.success) {
            return {
                success: false,
                errors: compressedImage.errors
            }
        }

        return {
            success: true,
            data: compressedImage.data
        }
    }

    static async compressAndStoreImageInDb(path: string, errorKey: string): Promise<UploadOK | UploadError> {
        // Read image
        let img: Jimp
        try {
            img = await Jimp.read(path)
        } catch (err) {
            return {
                success: false,
                errors: {
                    [errorKey]: err
                }
            }
        }

        const targetWidth = img.getWidth() > 1920 ? 1920 : img.getWidth()
        img
            // resize to max 1920x1920
            .resize(targetWidth, Jimp.AUTO)
            // set quality to 60%
            .quality(80)
            // set background to white
            .background(0xFFFFFFFF)

        // Store in db
        return img.getBufferAsync(Jimp.MIME_JPEG)
            .then(async (buffer) => {
                // set mime type to jpg
                const image = await prisma.images.create({
                    data: {
                        data: buffer,
                        uid: Authentication.generateAuthToken()
                    }
                })

                return {
                    success: true,
                    data: image
                } as UploadOK
            }).catch((err) => {
                return {
                    success: false,
                    errors: {
                        [errorKey]: err
                    }
                } as UploadError
            })
    }

    static async delete(uid: string) {
        const image = await prisma.images.findUnique({
            where: {
                uid: uid
            }
        })

        if (image === null) {
            return false
        }

        await prisma.images.delete({
            where: {
                uid: uid
            }
        })

        return true
    }
}