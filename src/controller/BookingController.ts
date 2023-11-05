import { Request, Response, Router } from "express";
import { CustomerOrPegawaiRequest, CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { UserCustomer, UserPegawai } from "../modules/Models";
import { generateIdBooking } from "../modules/IdGenerator";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import moment from "moment-timezone";

function getHargaWithMarkup(hargaBasic: number, arrivalDate: Date, departureDate: Date, jumlahKamarTersedia: number, maxJumlahKamar: number, jumlahKamarBooking: number) {
    // decreasse by 2% each day as it gets closer to arrival date
    let hargaWithMarkup: number
    const daysLeft = Math.min(moment(arrivalDate).diff(moment(), "days"), 7)
    hargaWithMarkup = hargaBasic - ((7 - daysLeft) * 0.02 * hargaBasic)

    // increase by 3.5% for each additional capacity after 50% of max capacity
    const kapasitasThreshold = Math.round(maxJumlahKamar / 2)
    if (jumlahKamarTersedia < kapasitasThreshold) {
        hargaWithMarkup += (kapasitasThreshold - jumlahKamarTersedia) * 0.035 * hargaBasic
    }

    // decrease by 2% for each additional day after 3 days, max 10 days
    const daysStayed = moment(departureDate).diff(moment(arrivalDate), "days")
    if (daysStayed > 2) {
        const daysStayedTambahan = Math.min(daysStayed - 3, 10)
        hargaWithMarkup -= daysStayedTambahan * 0.02 * hargaBasic
    }

    // decrease by 1.5% for each additional kamar booked after 3 kamar, max 10 kamar
    if (jumlahKamarBooking > 2) {
        const jumlahKamarTambahan = Math.min(jumlahKamarBooking - 3, 10)
        hargaWithMarkup -= jumlahKamarTambahan * 0.015 * hargaBasic
    }

    return hargaWithMarkup
}

async function createBooking(customer: UserCustomer, jenisKamar: { id_jk: number, jumlah: number, harga: number }[], detail: { arrival_date: Date, departure_date: Date, jumlah_dewasa: number, jumlah_anak: number, permintaan_tambahan?: string }, petugasSM?: UserPegawai) {
    return await PrismaScope(async (prisma) => {
        let customerType: "P" | "G"
        if (petugasSM) {
            customerType = "G"
        } else {
            customerType = "P"
        }
        const idBooking = await generateIdBooking(customerType, new Date())

        // Insert into 'reservasi'
        const reservasi = await prisma.reservasi.create({
            data: {
                id_customer: customer.id!!,
                id_booking: idBooking,
                id_sm: petugasSM?.id,
                arrival_date: detail.arrival_date,
                departure_date: detail.departure_date,
                jumlah_dewasa: detail.jumlah_dewasa,
                jumlah_anak: detail.jumlah_anak,
                permintaan_tambahan: detail.permintaan_tambahan,
                status: "pending",
                total: 0,
            }
        })

        // Insert into 'reservasi_rooms'
        await prisma.reservasi_rooms.createMany({
            data: jenisKamar.map((item) => ({
                id_reservasi: reservasi.id!!,
                id_jenis_kamar: item.id_jk,
                jumlah: item.jumlah,
                harga_per_malam: item.harga
            }))
        })

        const reservasiRooms = await prisma.reservasi_rooms.findMany({
            where: {
                id_reservasi: reservasi.id!!
            },
            include: {
                jenis_kamar: true
            }
        })

        // Total akan diupdate oleh trigger di database

        return {
            reservasi,
            kamar: reservasiRooms
        }
    })
}

function getCurrentDate() {
    return moment().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0).toDate()
}

export default class BookingController {
    static async getKetersediaanKamarDanTarif(req: Request | PegawaiRequest, res: Response) {
        const validation = Validation.body(req, {
            check_in: {
                required: true,
                type: "datetime",
                after: getCurrentDate()
            },
            check_out: {
                required: true,
                type: "datetime",
                after: "check_in"
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

        const momentCheckIn = moment(check_in)
        const jumlahMalam = moment(check_out).diff(momentCheckIn, "days")

        if ((req as PegawaiRequest).data?.user) {

        } else {
            if (jumlah_kamar > 5) {
                return ApiResponse.error(res, {
                    message: "Maksimal pemesanan adalah 5 kamar",
                    errors: {
                        jumlah_kamar: "Maksimal pemesanan adalah 5 kamar"
                    }
                }, 422)
            }
        }

        if (jumlahMalam > 30) {
            return ApiResponse.error(res, {
                message: "Maksimal pemesanan adalah 30 malam",
                errors: {
                    check_out: "Maksimal pemesanan adalah 30 malam"
                }
            }, 422)
        }

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
                count: item._count.no_kamar,
                terisiPerHari: Array(jumlahMalam).fill(0)
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
            // Looping though each tanggal
            for (let i = 0; i < jumlahMalam; i++) {
                const tglCI = momentCheckIn.clone().add(i, "days").toDate()
                const tglCO = momentCheckIn.clone().add(i + 1, "days").toDate()

                const jumlahTerpesanPerJK = await prisma.reservasi_rooms.groupBy({
                    where: {
                        OR: [
                            {
                                reservasi: {
                                    arrival_date: {
                                        lt: tglCI
                                    },
                                    departure_date: {
                                        gt: tglCI
                                    }
                                }
                            },
                            {
                                reservasi: {
                                    arrival_date: {
                                        lt: tglCO
                                    },
                                    departure_date: {
                                        gt: tglCO
                                    }
                                }
                            },
                            {
                                reservasi: {
                                    arrival_date: {
                                        gte: tglCI
                                    },
                                    departure_date: {
                                        lte: tglCO
                                    }
                                }
                            }
                        ]
                    },
                    by: ["id_jenis_kamar"],
                    _count: {
                        _all: true
                    }
                })

                // Looping through each jumlahKamarTerpesanPerJenisKamar
                for (const rooms of jumlahTerpesanPerJK) {
                    const idJK = rooms.id_jenis_kamar
                    const objJK = jumlahJenisKamar.find((item) => item.id === idJK)

                    if (objJK) {
                        // Fill the array
                        objJK.terisiPerHari[i] = rooms._count._all
                    }
                }
            }

            // Get jenis kamar detail and tarif
            const dataLengkap = (await Promise.all(jumlahJenisKamar.map(async (item) => {
                const remarks: { type: "w" | "e", message: string }[] = []

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
                        message: `Jumlah kamar tersedia hanya ${item.count}`
                    })
                }

                if (item.count === 0) {
                    remarks.push({
                        type: "e",
                        message: `Tidak ada kamar tersedia`
                    })
                }

                if (jumlah_kamar * jenisKamar.kapasitas < jumlah_dewasa + jumlah_anak) {
                    remarks.push({
                        type: "w",
                        message: `Jumlah kamar yang dipesan mungkin tidak cukup`
                    })
                }

                // @ts-ignore
                delete jenisKamar.harga_dasar

                const maxTerisi = Math.max(...item.terisiPerHari, 0)
                const jumlahKamarTersedia = item.count - maxTerisi

                return {
                    jenisKamar,
                    rincian_tarif: {
                        jumlah_kamar: jumlahKamarTersedia,
                        harga: getHargaWithMarkup(harga, check_in, check_out, jumlahKamarTersedia, item.count, jumlah_kamar),
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

    static async createBookingC(req: CustomerRequest, res: Response) {
        const validate = Validation.body(req, {
            jenis_kamar: {
                required: true,
                type: "array",
                customRule: (value) => {
                    const validateJenisKamar = new Validation(value, {
                        id_jk: {
                            required: true,
                            type: "number"
                        },
                        jumlah: {
                            required: true,
                            type: "number",
                            min: 1
                        }
                    }).validate()

                    if (validateJenisKamar.fails()) {
                        return validateJenisKamar.errorToString()
                    }

                    return null
                }
            },
            detail: {
                required: true,
                customRule: (value) => {
                    const validateDetail = new Validation(value, {
                        arrival_date: {
                            required: true,
                            type: "datetime",
                            after: getCurrentDate()
                        },
                        departure_date: {
                            required: true,
                            type: "datetime",
                            after: "arrival_date"
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
                        },
                        permintaan_tambahan: {
                            required: false
                        }
                    }).validate()

                    if (validateDetail.fails()) {
                        return validateDetail.errorToString()
                    }

                    return null
                }
            }
        })

        if (validate.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validate.errors
            }, 422)
        }

        const { jenis_kamar, detail } = validate.validated()
        detail.arrival_date = moment(detail.arrival_date).toDate()
        detail.departure_date = moment(detail.departure_date).toDate()
        detail.jumlah_dewasa = +detail.jumlah_dewasa
        detail.jumlah_anak = +detail.jumlah_anak

        const customer = req.data?.user!!

        const createResult = await createBooking(customer, jenis_kamar, detail)

        return ApiResponse.success(res, {
            message: "Berhasil membuat reservasi",
            data: createResult
        })
    }
}

// Router
export const routerPublic = Router()
routerPublic.post("/search", BookingController.getKetersediaanKamarDanTarif)

export const routerC = Router()
routerC.post("/", BookingController.createBookingC)

export const routerP = Router()


// const listTanggal: { tanggal: string, jlhKamar: number }[] = []
//             for (const reservasi of jumlahKamarTerpesanPerJenisKamar) {
//                 const arrDate = moment(reservasi.arrival_date)
//                 const thisListTanggal = []

//                 for (let i = 0; i < reservasi.jumlah_malam!!; i++) {
//                     // Loop harusnya <=, tapi kita anggap saja tanggal terakhir itu tidak dihitung agar lebih mudah
//                     const tanggal = arrDate.clone().add(i, "days").format("YYYYMMDD")
//                     thisListTanggal.push(tanggal)
//                 }
//                 const tanggalAsText = thisListTanggal.join("-")
//                 console.log(tanggalAsText)

//                 listTanggal.push({
//                     tanggal: tanggalAsText,
//                     jlhKamar: reservasi.reservasi_rooms.length
//                 })
//             }

//             for (const reservasi of jumlahKamarTerpesanPerJenisKamar) {
//                 for (const rooms of reservasi.reservasi_rooms) {
//                     const idJK = rooms.id_jenis_kamar
//                     const objJK = jumlahJenisKamar.find((item) => item.id === idJK)

//                     // @ts-ignore
//                     objJK.count -= 1
//                 }
//             }