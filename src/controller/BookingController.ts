import { Request, Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { ReservasiLayanan, ReservasiRooms } from "../modules/Models";
import { generateIdBooking } from "../modules/IdGenerator";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import moment from "moment-timezone";
import ImageUpload, { multerUploadDest } from "../modules/ImageUpload";
import Authentication from "../modules/Authentication";

function getHargaWithMarkup(hargaBasic: number, arrivalDate: Date, departureDate: Date, jumlahKamarTersedia: number, maxJumlahKamar: number, jumlahKamarBooking: number) {
    // decreasse by 2% each day as it gets closer to arrival date
    let hargaWithMarkup: number
    let hargaMax = hargaBasic
    const daysLeft = Math.min(moment(arrivalDate).diff(moment(), "days"), 7)
    hargaWithMarkup = hargaBasic - ((7 - daysLeft) * 0.02 * hargaBasic)

    // increase by 3.5% for each additional capacity after 50% of max capacity
    const kapasitasThreshold = Math.round(maxJumlahKamar / 2)
    if (jumlahKamarTersedia < kapasitasThreshold) {
        const perubahan = (kapasitasThreshold - jumlahKamarTersedia) * 0.035 * hargaBasic
        hargaWithMarkup += perubahan
        hargaMax += perubahan
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

    return {
        harga: hargaWithMarkup,
        harga_max: hargaMax
    }
}

async function getKetersediaanKamar(arrivalDate: Date, departureDate: Date, maxJumlahMalam?: number) {
    const momentCheckIn = moment(arrivalDate)
    const jumlahMalam = moment(departureDate).diff(momentCheckIn, "days")

    if (maxJumlahMalam && jumlahMalam > maxJumlahMalam) {
        throw new Error(`Maksimal pemesanan adalah ${maxJumlahMalam} malam`)
    }

    const jumlahKamarPerJenisKamar = await prisma.kamar.groupBy({
        by: ["id_jenis_kamar"],
        _count: {
            no_kamar: true
        }
    })

    const jumlahJenisKamar = jumlahKamarPerJenisKamar.map((item) => ({
        id: item.id_jenis_kamar,
        totalKamar: item._count.no_kamar,
        kamarTersedia: item._count.no_kamar,
        terisiPerHari: Array(jumlahMalam).fill(0)
    }))

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
                ],
                reservasi: {
                    status: {
                        notIn: ["batal", "expired"]
                    }
                }
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

    // console.log(arrivalDate, departureDate, jumlahJenisKamar)

    jumlahJenisKamar.forEach((item) => {
        const maxTerisi = Math.max(...item.terisiPerHari, 0)
        item.kamarTersedia -= maxTerisi
    })
    return jumlahJenisKamar
}

async function getTarifKamar(idJK: number, arrivalDate: Date, departureDate: Date, jumlahKamarTersedia: number, maxJumlahKamar: number, jumlahKamarBooking: number) {
    const tarifSeason = await prisma.tarif.findFirst({
        where: {
            id_jenis_kamar: idJK,
            season: {
                AND: [
                    {
                        tanggal_start: {
                            lte: arrivalDate
                        }
                    },
                    {
                        tanggal_end: {
                            gte: arrivalDate // Mengikuti tanggal check-in
                        }
                    }
                ]
            },
        }
    })

    const jenisKamar = await prisma.jenis_kamar.findFirst({
        where: {
            id: idJK
        },
        select: {
            harga_dasar: true
        }
    })

    const harga = tarifSeason?.harga ?? jenisKamar?.harga_dasar

    if (!harga) {
        throw new Error("Harga tidak ditemukan")
    }

    return getHargaWithMarkup(harga, arrivalDate, departureDate, jumlahKamarTersedia, maxJumlahKamar, jumlahKamarBooking)
}

async function getKetersediaanKamarDanTarif(req: Request, res: Response, _?: number, idSM?: number) {
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

    let maxJumlahMalam: number
    if (idSM) {
        if (jumlah_kamar > 20) {
            return ApiResponse.error(res, {
                message: "Maksimal pemesanan adalah 20 kamar dalam satu reservasi",
                errors: {
                    jumlah_kamar: "Maksimal pemesanan adalah 20 kamar dalam satu reservasi"
                }
            }, 422)
        }
        maxJumlahMalam = 30
    } else {
        if (jumlah_kamar > 5) {
            return ApiResponse.error(res, {
                message: "Maksimal pemesanan adalah 5 kamar",
                errors: {
                    jumlah_kamar: "Maksimal pemesanan adalah 5 kamar"
                }
            }, 422)
        }
        maxJumlahMalam = 7
    }

    let jumlahJenisKamar;
    try {
        jumlahJenisKamar = await getKetersediaanKamar(check_in, check_out, maxJumlahMalam)
    } catch (error: any) {
        return ApiResponse.error(res, {
            message: error.message,
            errors: null
        }, 500)
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

        let tarifKamar;
        try {
            const tglCheckIn = new Date(check_in)
            const tglCheckOut = new Date(check_out)
            tarifKamar = await getTarifKamar(item.id, tglCheckIn, tglCheckOut, item.kamarTersedia, item.totalKamar, jumlah_kamar)
        } catch (error: any) {
            return null
        }

        // Remarks
        if (item.kamarTersedia <= 0) {
            remarks.push({
                type: "e",
                message: `Tidak ada kamar tersedia`
            })
        } else if (item.kamarTersedia < jumlah_kamar) {
            remarks.push({
                type: "w",
                message: `Jumlah kamar tersedia hanya ${item.kamarTersedia}`
            })
        }

        if (jumlah_dewasa + jumlah_anak > jumlah_kamar * jenisKamar.kapasitas) {
            remarks.push({
                type: "w",
                message: `Kapasitas kamar mungkin tidak mencukupi untuk jumlah tamu`
            })
        }

        return {
            jenis_kamar: jenisKamar,
            rincian_tarif: {
                jumlah_kamar: item.kamarTersedia,
                harga_diskon: tarifKamar.harga,
                harga: tarifKamar.harga_max,
                catatan: remarks
            }
        }
    }))).filter((item) => item !== null)?.sort((a, b) => {
        if (a?.rincian_tarif.jumlah_kamar === 0) {
            return 1
        } else if (b?.rincian_tarif.jumlah_kamar === 0) {
            return -1
        } else {
            return 0
        }
    })

    return ApiResponse.success(res, {
        message: "Berhasil mendapatkan data ketersediaan kamar dan tarif",
        data: dataLengkap
    })
}

async function validateCreateBooking(req: Request, res: Response, idC: number, idSM?: number) {
    const validate = Validation.body(req, {
        jenis_kamar: {
            required: true,
            type: "array",
            customRule: (value: any[]) => {
                if (value.length === 0) {
                    return "Tidak ada jenis kamar yang dipilih"
                }

                for (const item of value) {
                    const validateJenisKamar = new Validation(item, {
                        id_jk: {
                            required: true,
                            type: "number"
                        },
                        jumlah: {
                            required: true,
                            type: "number",
                            min: 1
                        },
                        harga: {
                            required: true,
                            type: "number",
                            min: 0
                        }
                    }).validate()

                    if (validateJenisKamar.fails()) {
                        return validateJenisKamar.errorToString()
                    }
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

    if (idSM) {
        // Check if customernya benar-benar customer group
        const customer = await prisma.user_customer.findFirst({
            where: {
                id: idC,
                type: "g"
            }
        })

        if (!customer) {
            return ApiResponse.error(res, {
                message: "Customer tidak ditemukan",
                errors: null
            }, 404)
        }
    }

    const { jenis_kamar, detail } = validate.validated()
    detail.arrival_date = new Date(detail.arrival_date)
    detail.departure_date = new Date(detail.departure_date)
    detail.jumlah_dewasa = +detail.jumlah_dewasa
    detail.jumlah_anak = +detail.jumlah_anak

    try {
        const createResult = await createBooking(jenis_kamar, detail, idSM ? 180 : 20, idC, idSM)
        return ApiResponse.success(res, {
            message: "Berhasil membuat reservasi",
            data: createResult
        })
    } catch (error: any) {
        return ApiResponse.error(res, {
            message: error.message,
            errors: null
        }, 500)
    }
}

async function createBooking(jenisKamar: { id_jk: number, jumlah: number, harga: number }[], detail: { arrival_date: Date, departure_date: Date, jumlah_dewasa: number, jumlah_anak: number }, deadlineBookingMinutes: number = 20, idC: number, idSM?: number) {
    // Insert into 'reservasi'
    const reservasi = await prisma.reservasi.create({
        data: {
            id_customer: idC,
            // belum ada ID Booking, nanti digenerate saat mau bayar
            id_sm: idSM,
            arrival_date: detail.arrival_date,
            departure_date: detail.departure_date,
            jumlah_dewasa: detail.jumlah_dewasa,
            jumlah_anak: detail.jumlah_anak,
            status: "pending-1",
            tanggal_dl_booking: new Date(new Date().getTime() + 1000 * 60 * deadlineBookingMinutes), // deadlineBookingMinutes minutes from now
            total: 0,
        }
    })

    let maxJumlahMalam: number
    if (idSM) {
        maxJumlahMalam = 30
    } else {
        maxJumlahMalam = 7
    }

    // Insert into 'reservasi_rooms'
    const ketersediaanKamar = await getKetersediaanKamar(detail.arrival_date, detail.departure_date, maxJumlahMalam) // @throws Error
    const tarifKamar: ReservasiRooms[] = []
    const totalKamar = jenisKamar.reduce((acc, item) => acc + item.jumlah, 0)

    await Promise.all(jenisKamar.map(async (item) => {
        // get tarif between the inputted & from db, if the difference is < 5%, allow it
        // else, throw error
        const thisJK = ketersediaanKamar.find((it) => it.id === item.id_jk)
        const tarif = await getTarifKamar(item.id_jk, detail.arrival_date, detail.departure_date, thisJK?.kamarTersedia ?? item.jumlah, thisJK?.totalKamar ?? item.jumlah, totalKamar)

        // console.log(item.id_jk, item.harga, tarif)
        if (Math.abs(tarif.harga - item.harga) > 0.05 * item.harga) {
            await prisma.reservasi.delete({ where: { id: reservasi.id!! } })
            throw new Error(`Telah terjadi perubahan harga signifikan sejak Anda memeriksa harga kamar. Silakan refresh halaman ini.`)
        }

        if (item.jumlah > (thisJK?.kamarTersedia ?? 0)) {
            await prisma.reservasi.delete({ where: { id: reservasi.id!! } })
            throw new Error(`Jumlah kamar ${item.id_jk} tersedia saat ini hanya sebanyak ${thisJK?.kamarTersedia}. Silakan refresh halaman ini.`)
        }

        for (let i = 0; i < item.jumlah; i++) {
            tarifKamar.push({
                id_reservasi: reservasi.id!!,
                id_jenis_kamar: item.id_jk,
                harga_per_malam: item.harga
            })
        }
    }))

    await prisma.reservasi_rooms.createMany({
        data: tarifKamar
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
}

async function getDeadlineBooking(idR: number, idC: number, idSM?: number) {
    const reservasi = await prisma.reservasi.findFirst({
        where: {
            id_customer: idC,
            id: idR,
            id_sm: idSM
        }
    })

    if (!reservasi) {
        throw new Error("Reservasi tidak ditemukan.")
    }

    if (!reservasi.status.startsWith("pending-")) {
        throw new Error("Reservasi ini tidak dapat diganggu gugat lagi.")
    }

    if ((reservasi.tanggal_dl_booking ?? new Date()) <= new Date()) {
        throw new Error("Reservasi ini sudah melewati batas waktu pemesanan.")
    }

    return {
        deadline: reservasi.tanggal_dl_booking,
        stage: +reservasi.status.substring("pending-".length, "pending-".length + 1)
    }
}

async function apiStep1(req: Request, res: Response, idR: number, idC: number, idSM?: number) {
    // MAIN LOGIC START
    const stage = await getCurrentStage(idR, idSM)
    if (stage !== 1) {
        return ApiResponse.error(res, {
            message: "Server dan client tidak sinkron. Silakan refresh halaman.",
            errors: null
        }, 400)
    }

    const validate = Validation.body(req, {
        layanan_tambahan: {
            required: false,
            type: "array",
            customRule: (value: any[]) => {
                for (const item of value) {
                    const validateFLT = new Validation(item, {
                        id: {
                            required: true,
                            type: "number"
                        },
                        amount: {
                            required: true,
                            type: "number",
                            min: 1
                        }
                    }).validate()

                    if (validateFLT.fails()) {
                        return validateFLT.errorToString()
                    }
                }

                return null
            }
        },
        permintaan_khusus: {
            required: true,
            customRule: (value) => {
                const validateDetail = new Validation(value, {
                    expected_check_in: {
                        required: false
                    },
                    expected_check_out: {
                        required: false
                    },
                    permintaan_tambahan_lain: {
                        required: false,
                        maxLength: 254
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

    const { layanan_tambahan, permintaan_khusus } = validate.validated()

    // Permintaan khusus
    let permintaanTambahan: string | null = "";
    if (permintaan_khusus.expected_check_in) {
        permintaanTambahan += `Check-in: ${permintaan_khusus.expected_check_in}.\n`
    }
    if (permintaan_khusus.expected_check_out) {
        permintaanTambahan += `Check-out: ${permintaan_khusus.expected_check_out}.\n`
    }
    if (permintaan_khusus.permintaan_tambahan_lain) {
        permintaanTambahan += `Permintaan lain:\n${permintaan_khusus.permintaan_tambahan_lain}`
    }
    permintaanTambahan = permintaanTambahan.trim() || null

    const reservasi = await prisma.reservasi.update({
        data: {
            permintaan_tambahan: permintaanTambahan,
            status: "pending-2"
        },
        where: {
            id_customer: idC,
            id: idR,
            id_sm: idSM
        }
    })

    // Layanan tambahan
    const layananTambahan = await prisma.layanan_tambahan.findMany()

    const layananTambahanReservasi = layananTambahan.map<ReservasiLayanan>((item) => {
        const layanan = (layanan_tambahan as { id: number, amount: number }[]).find((it) => it.id === item.id)
        return {
            id_reservasi: reservasi.id!!,
            id_layanan: item.id,
            qty: (layanan?.amount ?? 0),
            total: item.tarif * (layanan?.amount ?? 0)
        }
    }).filter((item) => item.qty > 0)

    await prisma.reservasi_layanan.createMany({
        data: layananTambahanReservasi
    })

    return ApiResponse.success(res, {
        message: "Berhasil mengisi layanan tambahan & permintaan khusus",
        data: {
            reservasi,
            layanan_tambahan: layananTambahanReservasi
        }
    })
}

async function apiStep2(req: Request, res: Response, idR: number, idC: number, idSM?: number) {
    let idBookingPrefix: "G" | "P"
    if (idSM) {
        idBookingPrefix = "G" // Group
    } else {
        idBookingPrefix = "P" // Personal
    }

    // MAIN LOGIC START
    const stage = await getCurrentStage(idR, idSM)
    if (stage !== 2) {
        return ApiResponse.error(res, {
            message: "Server dan client tidak sinkron. Silakan refresh halaman.",
            errors: null
        }, 400)
    }

    // Update reservasi: set id booking
    const idBooking = await generateIdBooking(idBookingPrefix, new Date())
    const reservasi = await prisma.reservasi.update({
        data: {
            id_booking: idBooking,
            status: "pending-3"
        },
        where: {
            id_customer: idC,
            id: idR,
            id_sm: idSM
        }
    })

    return ApiResponse.success(res, {
        message: "Berhasil mengupdate data reservasi",
        data: reservasi
    })
}

async function apiStep3(req: Request, res: Response, idR: number, idC: number, idSM?: number) {
    if (!idSM) {
        if (!req.file) {
            return ApiResponse.error(res, {
                message: "Bukti transfer harus diupload",
                errors: {
                    bukti: "Bukti transfer harus diupload"
                }
            }, 422)
        }
    } else {
        const validate = Validation.body(req, {
            jumlah_dp: {
                required: true,
                type: "number",
                min: 0
            }
        })

        if (validate.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validate.errors
            }, 422)
        }
    }

    const bukti = req.file
    const jumlah_dp = +req.body.jumlah_dp

    // MAIN LOGIC START
    const stage = await getCurrentStage(idR, idSM)
    if (stage !== 3) {
        return ApiResponse.error(res, {
            message: "Server dan client tidak sinkron. Silakan refresh halaman.",
            errors: null
        }, 400)
    }

    let uidGambar: string | undefined = undefined
    let status: "dp" | "lunas"
    if (!idSM) {
        // Customer P: Menggunakan bukti gambar
        const result = await ImageUpload.handlesingleUpload("gambar", bukti)
        if (!result.success) {
            return ApiResponse.error(res, {
                message: "Gagal mengupload gambar",
                errors: result.errors
            }, 422)
        }

        uidGambar = result.data.uid
        status = "lunas" // auto set lunas
    } else {
        // Customer G: Menggunakan jumlah DP
        const totalHargaKamar = ((await prisma.reservasi.findFirst({
            where: {
                id_customer: idC!!,
                id: idR,
                id_sm: idSM
            },
            select: {
                total: true
            }
        }))?.total) ?? 0

        const minimalDp = totalHargaKamar / 2

        if (jumlah_dp < minimalDp) {
            return ApiResponse.error(res, {
                message: `Jumlah DP minimal adalah ${minimalDp}`,
                errors: {
                    jumlah_dp: `Jumlah DP minimal adalah ${minimalDp}`
                }
            }, 422)
        }

        if (jumlah_dp >= totalHargaKamar) {
            status = "lunas"
        } else {
            status = "dp"
        }
    }

    // Update reservasi: set bukti
    const reservasi = await prisma.reservasi.update({
        data: {
            bukti_transfer: uidGambar,
            jumlah_dp: jumlah_dp,
            tanggal_dp: new Date(),
            status: status // auto set lunas
        },
        where: {
            id_customer: idC!!,
            id: idR,
            id_sm: idSM
        }
    })

    return ApiResponse.success(res, {
        message: "Reservasi berhasil dibuatkan bukti transfer",
        data: reservasi
    })
}

async function getCurrentStage(idR: number, idSM?: number) {
    const currentStage = (await prisma.reservasi.findFirst({
        where: {
            id: idR,
            tanggal_dl_booking: {
                gte: new Date()
            },
            id_sm: idSM
        },
        select: {
            status: true
        }
    }))

    return +(currentStage?.status.substring("pending-".length, "pending-".length + 1) ?? 0)
}

function getCurrentDate() {
    return moment().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0).toDate()
}

export default class BookingController {
    static async getKetersediaanKamarDanTarifPublic(req: Request, res: Response) {
        return getKetersediaanKamarDanTarif(req, res)
    }

    // Customer Group (SM)
    static async getKetersediaanKamarDanTarifSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idC } = req.params

        return getKetersediaanKamarDanTarif(req, res, +idC, sm.id)
    }
    static async createBookingSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idC } = req.params

        return validateCreateBooking(req, res, +idC, sm.id)
    }

    static async getDeadlineBookingSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idR } = req.params

        const idC = await prisma.reservasi.findFirst({
            where: {
                id: +idR,
                id_sm: sm.id
            },
            select: {
                id_customer: true
            }
        })

        try {
            const deadlineBooking = await getDeadlineBooking(+idR, +(idC?.id_customer ?? 0), sm.id)
            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan deadline booking",
                data: deadlineBooking
            })
        } catch (error: any) {
            return ApiResponse.error(res, {
                message: error.message,
                errors: null
            }, 500)
        }
    }

    static async apiStep1BookingSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idR } = req.params

        const idC = await prisma.reservasi.findFirst({
            where: {
                id: +idR,
                id_sm: sm.id
            },
            select: {
                id_customer: true
            }
        })

        return apiStep1(req, res, +idR, +(idC?.id_customer ?? 0), sm.id)
    }

    static async apiStep2BookingSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idR } = req.params

        const idC = await prisma.reservasi.findFirst({
            where: {
                id: +idR,
                id_sm: sm.id
            },
            select: {
                id_customer: true
            }
        })

        return await apiStep2(req, res, +idR, +(idC?.id_customer ?? 0), sm.id)
    }

    static async apiStep3BookingSM(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const sm = req.data?.user!!
        const { idR } = req.params

        const idC = await prisma.reservasi.findFirst({
            where: {
                id: +idR,
                id_sm: sm.id
            },
            select: {
                id_customer: true
            }
        })

        return await apiStep3(req, res, +idR, +(idC?.id_customer ?? 0), sm.id)
    }

    // Customer Personal
    static async createBookingC(req: CustomerRequest, res: Response) {
        const customer = req.data?.user!!

        return validateCreateBooking(req, res, customer.id!!)
    }

    static async getDeadlineBookingC(req: CustomerRequest, res: Response) {
        const customer = req.data?.user!!
        const id = req.params.id

        try {
            const deadlineBooking = await getDeadlineBooking(+id, customer.id!!)
            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan deadline booking",
                data: deadlineBooking
            })
        } catch (error: any) {
            return ApiResponse.error(res, {
                message: error.message,
                errors: null
            }, 500)
        }
    }

    static async apiStep1BookingC(req: CustomerRequest, res: Response) {
        // Digunakan pada halaman 'customer/booking/{id}/step-1' untuk mengisi layanan tambahan & permintaan khusus
        const id = req.params.id
        const customer = req.data?.user!!

        return apiStep1(req, res, +id, customer.id!!)
    }

    static async apiStep2BookingC(req: CustomerRequest, res: Response) {
        const id = req.params.id
        const customer = req.data?.user!!

        return await apiStep2(req, res, +id, customer.id!!)
    }

    static async apiStep3BookingC(req: CustomerRequest, res: Response) {
        const id = req.params.id
        const customer = req.data?.user!!

        return await apiStep3(req, res, +id, customer.id!!)
    }
}

// Router
export const routerPublic = Router()
routerPublic.post("/search", BookingController.getKetersediaanKamarDanTarifPublic)

export const routerC = Router()
routerC.post("/", BookingController.createBookingC)
routerC.get("/:id/deadline", BookingController.getDeadlineBookingC)
routerC.post("/:id/step-1", BookingController.apiStep1BookingC)
routerC.post("/:id/step-2", BookingController.apiStep2BookingC)
routerC.post("/:id/step-3", multerUploadDest.single('bukti'), BookingController.apiStep3BookingC) // MEnggunakan file bukti

export const routerP = Router()
routerP.post("/search/:idC", BookingController.getKetersediaanKamarDanTarifSM)
routerP.post("/:idC", BookingController.createBookingSM)
routerP.get("/:idR/deadline", BookingController.getDeadlineBookingSM)
routerP.post("/:idR/step-1", BookingController.apiStep1BookingSM)
routerP.post("/:idR/step-2", BookingController.apiStep2BookingSM)
routerP.post("/:idR/step-3", BookingController.apiStep3BookingSM) // Tidak menggunakan file, tapi "jumlah_dp"


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