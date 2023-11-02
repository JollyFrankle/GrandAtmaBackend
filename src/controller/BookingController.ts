import { Request, Response, Router } from "express";
import { CustomerRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";

export default class BookingController {
    static async getKetersediaanKamarDanTarif(req: Request, res: Response) {
        const validation = Validation.body(req, {
            check_in: {
                required: true,
                type: "datetime"
            },
            check_out: {
                required: true,
                type: "datetime"
            },
            jumlah_kamar: {
                required: true,
                type: "number",
                min: 1
            },
            jumlah_dewasa: {
                required: true,
                type: "number",
                min: 1
            },
            jumlah_anak: {
                required: true,
                type: "number",
                min: 0
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { check_in, check_out, jumlah_kamar, jumlah_dewasa, jumlah_anak } = validation.validated()

        return await PrismaScope(async (prisma) => {
            // 1. Get number or kamar for each jenis_kamar
            // 2. Get number of booked kamar for each jenis_kamar
            // 3. Get the tarif (if any) for each jenis_kamar, else use the default tarif (jenis_kamar.harga_dasar)

            // 1: SELECT A.id_jenis_kamar, COUNT(A.no_kamar) FROM kamar A GROUP BY A.id_jenis_kamar; // also get properties for jenis_kamar
            const jumlahKamarPerJenisKamar = await prisma.kamar.groupBy({
                by: ["id_jenis_kamar"],
                _count: {
                    no_kamar: true
                }
            })

            const jumlahJenisKamar = jumlahKamarPerJenisKamar.map((item) => ({
                id: item.id_jenis_kamar,
                count: item._count.no_kamar
            }))

            /**
             * Query:
                # tanggal mulai menginap = 2023-11-13
                # tanggal selesai menginap = 2023-11-18
                SELECT DISTINCT B.* FROM reservasi_rooms A
                INNER JOIN reservasi B ON A.id_reservasi = B.id
                WHERE (
                    B.arrival_date < "2023-11-13"
                    AND B.departure_date > "2023-11-13"
                ) OR (
                    B.arrival_date < "2023-11-18"
                    AND B.departure_date > "2023-11-18"
                ) OR (
                    B.arrival_date >= "2023-11-13"
                    AND B.departure_date <= "2023-11-18"
                );
             */
            const jumlahKamarTerpesanPerJenisKamar = await prisma.reservasi.findMany({
                where: {
                    OR: [
                        {
                            arrival_date: {
                                lt: check_in
                            },
                            departure_date: {
                                gt: check_in
                            }
                        },
                        {
                            arrival_date: {
                                lt: check_out
                            },
                            departure_date: {
                                gt: check_out
                            }
                        },
                        {
                            arrival_date: {
                                gte: check_in
                            },
                            departure_date: {
                                lte: check_out
                            }
                        }
                    ]
                },
                include: {
                    reservasi_rooms: true
                }
            })

            // Looping through each jumlahKamarTerpesanPerJenisKamar
            for (const reservasi of jumlahKamarTerpesanPerJenisKamar) {
                for (const rooms of reservasi.reservasi_rooms) {
                    const idJK = rooms.id_jenis_kamar
                    const objJK = jumlahJenisKamar.find((item) => item.id === idJK)

                    // @ts-ignore
                    objJK.count -= 1
                }
            }

            // Get jenis kamar detail and tarif
            const dataLengkap = (await Promise.all(jumlahJenisKamar.map(async (item) => {
                const remarks: { type: "w" | "e", content: string }[] = []

                const jenisKamar = await prisma.jenis_kamar.findFirst({
                    where: {
                        id: item.id
                    }
                })

                if (!jenisKamar) {
                    return null
                }

                const tarifSeason = await prisma.tarif.findFirst({
                    where: {
                        id_jenis_kamar: item.id,
                        season: {
                            AND: [
                                {
                                    tanggal_start: {
                                        lte: check_in
                                    }
                                },
                                {
                                    tanggal_end: {
                                        gte: check_in // Mengikuti tanggal check-in
                                    }
                                }
                            ]
                        },
                    }
                })

                const harga = tarifSeason?.harga ?? jenisKamar.harga_dasar

                // Remarks
                if (item.count < jumlah_kamar) {
                    remarks.push({
                        type: "w",
                        content: `Jumlah kamar tersedia hanya ${item.count}`
                    })
                }

                if (item.count === 0) {
                    remarks.push({
                        type: "e",
                        content: `Tidak ada kamar tersedia`
                    })
                }

                if (jumlah_kamar * jenisKamar.kapasitas < jumlah_dewasa + jumlah_anak) {
                    remarks.push({
                        type: "w",
                        content: `Jumlah kamar mungkin tidak mencukupi untuk jumlah tamu`
                    })
                }

                // @ts-ignore
                delete jenisKamar.harga_dasar

                return {
                    jenisKamar,
                    rincian_tarif: {
                        jumlah_kamar: item.count,
                        harga: harga,
                        catatan: remarks
                    }
                }
            }))).filter((item) => item !== null)

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data ketersediaan kamar dan tarif",
                data: dataLengkap
            })
        })
    }
}

// Router
export const router = Router()
router.post("/search", BookingController.getKetersediaanKamarDanTarif)