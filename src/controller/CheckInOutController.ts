import { Request, Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { JenisKamar, Kamar, Reservasi, ReservasiLayanan, ReservasiRooms } from "../modules/Models";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import moment from "moment-timezone";
import Utils from "../modules/Utils";
import ImageUpload, { multerUploadDest } from "../modules/ImageUpload";
import Settings from "../modules/Settings";
import { generateIdInvoice } from "../modules/IdGenerator";

interface KamarAvailibility {
    no_kamar: string,
    reservasi: Reservasi | null,
    jenis_kamar: {
        id: number,
        nama: string
    },
    detail: {
        smoking: boolean,
        bed: string
    },
    status: 'TSD' | 'TRS' | 'COT' | 'UNV' | 'OVS'
}

interface CheckInKamar {
    id_rr: number,
    no_kamar: string,
    new_id_jk: number | null
}

async function getKeterisianKamarHariIni(noLantai?: number, idJK?: number) {
    const listKamar = await prisma.kamar.findMany({
        where: {
            no_lantai: noLantai,
            id_jenis_kamar: idJK
        },
        orderBy: [
            {
                no_kamar: 'asc'
            }, {
                no_lantai: 'asc'
            }
        ],
        include: {
            jenis_kamar: true
        }
    })

    const roomsToday = await prisma.reservasi_rooms.findMany({
        where: {
            reservasi: {
                status: 'checkin'
            }
        },
        include: {
            reservasi: {
                include: {
                    user_customer: true,
                    reservasi_cico: true
                }
            }
        }
    })

    /**
     * TSD = Tersedia
     * TRS = Terisi
     * COT = Check Out Today
     * UNV = Unavailable
     * OVS = Overstay
     */
    const availibility: KamarAvailibility[] = []
    const idCustomerMaintenance = 0 // ID customer kalau kamar sedang maintenance

    listKamar.map((kamar) => {
        const reservasi = roomsToday.find((rr) => rr.no_kamar === kamar.no_kamar)?.reservasi
        let status: KamarAvailibility['status'] = 'TSD'
        if (reservasi) {
            if (reservasi.id) {
                status = 'TRS'
            }

            if (reservasi.id_customer === idCustomerMaintenance) {
                status = 'UNV'
            }

            const momentDeparture = moment(reservasi.departure_date)
            if (momentDeparture.isSameOrBefore(moment(), 'day')) {
                if (moment().hour() >= Utils.JAM_CHECKIN || momentDeparture.isBefore(moment(), 'day')) { // toleransi sampai jam 14.00 (jam mulai check in untuk hari ini)
                    status = 'OVS'
                } else {
                    status = 'COT'
                }
            }
        }

        availibility.push({
            no_kamar: kamar.no_kamar,
            reservasi: reservasi ?? null,
            jenis_kamar: {
                id: kamar.id_jenis_kamar,
                nama: kamar.jenis_kamar.nama
            },
            detail: {
                smoking: kamar.is_smoking === 1,
                bed: kamar.jenis_bed
            },
            status: status
        })
    })

    return availibility
}

function getTanggalCheckInHariIni() {
    // tanggal check in = kemarin kalau < 12.00, hari ini kalau >= 12.00
    const jamCI = Utils.JAM_CHECKIN
    const hariIni = moment()
    if (hariIni.hour() < Utils.JAM_CHECKOUT) {
        hariIni.subtract(1, 'day')
    }

    return hariIni.set({
        h: jamCI,
        m: 0,
        s: 0,
        ms: 0
    }).toDate()
}

function getTanggalCheckOutHariIni() {
    // tanggal check out = hari ini kalau < 14.00, besok kalau >= 14.00
    const jamCO = Utils.JAM_CHECKOUT
    const hariIni = moment()
    if (hariIni.hour() >= Utils.JAM_CHECKIN) {
        hariIni.add(1, 'day')
    }

    return hariIni.set({
        h: jamCO,
        m: 0,
        s: 0,
        ms: 0
    }).toDate()
}

export default class CheckInOutController {
    static async getListKetersediaanCurrently(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { no_lantai, id_jk } = req.query

        let noLantai: number | undefined = undefined
        let idJK: number | undefined = undefined
        if (no_lantai && (+no_lantai) >= 1 && (+no_lantai) <= 4) {
            noLantai = +no_lantai
        }

        if (id_jk && (+id_jk) >= 1 && (+id_jk) <= 4) {
            idJK = +id_jk
        }

        const availibility = await getKeterisianKamarHariIni(noLantai, idJK)

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data ketersediaan kamar',
            data: availibility
        })
    }

    // List tamu yang belum check in (status reservasi = lunas/DP, arrival_date <= hari ini)
    static async getListCheckInToday(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { show_tomorrow: alsoGetTomorrow } = req.query

        let tglHariIni = getTanggalCheckInHariIni()
        if (alsoGetTomorrow === 'true') {
            // if today's date !== tanggal boleh check in + 1 day, tidak boleh check in untuk besok
            if (!moment().isSame(moment(tglHariIni), 'day')) {
                tglHariIni = moment(tglHariIni).add(1, 'day').toDate()
            }
        }

        const reservasi = await prisma.reservasi.findMany({
            where: {
                status: {
                    in: ['lunas', 'dp'] // hanya yg sudah lunas/DP yang boleh check in
                },
                arrival_date: {
                    lte: tglHariIni // arrival hari ini atau kemarin boleh check in (kalau sudah > jam check out auto diset BATAL: ditangani cron job)
                },
                departure_date: {
                    gt: getTanggalCheckInHariIni() // departure hari ini atau <= kemarin boleh check out (kalau sudah > jam check out auto diset BATAL, ditangani cron job)
                }
            },
            orderBy: {
                arrival_date: 'desc' // biar tampil hari ini duluan, yang kemarin-kemarin terakhir
            },
            include: {
                user_customer: true,
                reservasi_rooms: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check in hari ini',
            data: {
                min_date: tglHariIni,
                max_date: getTanggalCheckOutHariIni(),
                reservasi: reservasi
            }
        })
    }

    // List tamu yang belum check out (status reservasi = checkin, departure_date <= hari ini)
    static async getListCheckOutToday(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const tglHariIni = getTanggalCheckOutHariIni()
        const reservasi = await prisma.reservasi.findMany({
            where: {
                status: 'checkin', // kalau statusnya masih checkin, berarti belum check out
                departure_date: {
                    lte: tglHariIni // departure hari ini atau <= kemarin boleh check out (kalau sudah > jam check out auto diset BATAL, ditangani cron job)
                }
            },
            orderBy: {
                departure_date: 'desc' // biar tampil hari ini duluan
            },
            include: {
                user_customer: true,
                reservasi_rooms: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check out hari ini',
            data: {
                max_date: tglHariIni,
                min_date: getTanggalCheckInHariIni(),
                reservasi: reservasi
            }
        })
    }

    // List tamu yang masih menginap (status reservasi = checkin) --> untuk bisa memesan layanan
    static async getListTamuMenginap(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const roomsToday = await prisma.reservasi.findMany({
            where: {
                status: 'checkin' // kalau statusnya masih checkin, berarti masih menginap
            },
            include: {
                user_customer: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data tamu yang sedang menginap',
            data: roomsToday
        })
    }

    // List tamu yang status = selesai
    static async getListTamuCheckedOut(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const roomsToday = await prisma.reservasi.findMany({
            where: {
                status: 'selesai' // kalau statusnya selesai, berarti sudah check out
            },
            include: {
                user_customer: true,
                invoice: true
            },
            orderBy: {
                departure_date: 'desc'
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data tamu yang sudah check out',
            data: roomsToday
        })
    }

    static async checkIn(req: PegawaiRequest, res: Response) {
        const { id } = req.params

        const validation = Validation.body(req, {
            deposit: {
                required: true,
                type: 'number',
                min: 300000
            },
            kamar: {
                required: true,
                customRule: (value) => {
                    // #CIOC-MultipartRequest - used in ModalCheckIn.tsx
                    let rooms: CheckInKamar[]
                    try {
                        rooms = JSON.parse(value) as CheckInKamar[]
                    } catch (e) {
                        return 'Request malformed untuk kamar!'
                    }

                    return rooms.filter((it) => !(+it.id_rr) || !it.no_kamar || typeof it.new_id_jk === "undefined").length > 0 ? 'Request malformed untuk kamar!' : null
                }
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const fileIdentitas = req.file
        if (!fileIdentitas) {
            return ApiResponse.error(res, {
                message: "Gambar identitas tidak ada",
                errors: {
                    gambar_identitas: "Gambar identitas tidak ada"
                }
            }, 422)
        }

        const { deposit, kamar } = validation.validated()
        const rooms = JSON.parse(kamar) as CheckInKamar[]

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: +id,
                status: {
                    in: ["lunas", "dp"]
                }
            },
            include: {
                user_customer: true,
                reservasi_rooms: true // get semua kamar yang dipessan
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan atau tidak bisa di-check in",
                errors: null
            }, 404)
        }

        // Cek apakah semua kamar sudah dipilih:
        const reservasiRooms = reservasi.reservasi_rooms
        const kamarBelumDipilih = reservasiRooms.filter((rr) => !rooms.find((it) => it.id_rr === rr.id))

        if (kamarBelumDipilih.length > 0) {
            return ApiResponse.error(res, {
                message: "Ada kamar yang belum dipilih",
                errors: null
            }, 422)
        }

        const ketersediaanSaatIni = await getKeterisianKamarHariIni()
        for (const kamar of rooms) {
            const kamarSaatIni = ketersediaanSaatIni.find((it) => it.no_kamar === kamar.no_kamar)
            if (kamarSaatIni?.status === 'TSD') {
                const detailRR = reservasiRooms.find((it) => it.id === kamar.id_rr)
                // Kamar tersedia, cek apakah ada perubahan jenis kamar
                if (detailRR?.id_jenis_kamar === kamar.new_id_jk) {
                    // Tidak ada perubahan jenis kamar
                    await prisma.reservasi_rooms.update({
                        where: {
                            id: kamar.id_rr
                        },
                        data: {
                            no_kamar: kamar.no_kamar
                        }
                    })
                } else {
                    // Ada perubahan jenis kamar
                    await prisma.reservasi_rooms.update({
                        where: {
                            id: kamar.id_rr
                        },
                        data: {
                            no_kamar: kamar.no_kamar,
                            id_jenis_kamar: kamar.new_id_jk ?? undefined
                        }
                    })
                }
            } else {
                // Delete semua kamar yang sudah dipilih
                await prisma.reservasi_rooms.updateMany({
                    where: {
                        id_reservasi: reservasi.id
                    },
                    data: {
                        no_kamar: null
                    }

                })

                return ApiResponse.error(res, {
                    message: `Kamar ${kamar.no_kamar} tidak tersedia`,
                    errors: null
                }, 422)
            }
        }

        // Update status reservasi menjadi checkin
        const result = await ImageUpload.handlesingleUpload("gambar_identitas", fileIdentitas)
        if (result.success) {
            await prisma.reservasi.update({
                where: {
                    id: reservasi.id
                },
                data: {
                    status: "checkin"
                }
            })

            // Insert to reservasi_cico
            await prisma.reservasi_cico.create({
                data: {
                    id_reservasi: reservasi.id,
                    id_fo: req.data?.user?.id!!,
                    deposit: +deposit,
                    gambar_identitas: result.data?.uid
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil melakukan check in",
                data: null
            })
        }
    }

    static async pesanLayanan(req: PegawaiRequest, res: Response) {
        const idReservasi = +req.params.id

        const validation = Validation.body(req, {
            layanan: {
                required: true,
                customRule: (value) => {
                    let layanan = value as { id: number, qty: number }[]

                    return layanan.filter((it) => !(+it.id) || !(+it.qty)).length > 0 ? 'Request malformed untuk layanan!' : null
                }
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { layanan: _lay } = validation.validated()
        const layanan = _lay as { id: number, qty: number }[]

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: idReservasi,
                status: 'checkin'
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan atau sudah tidak bisa lagi memesan layanan",
                errors: null
            }, 404)
        }

        // Validate layanan
        const listLayanan = await prisma.layanan_tambahan.findMany({
            where: {
                id: {
                    in: layanan.map((it) => it.id)
                }
            }
        })

        if (listLayanan.length !== layanan.length) {
            return ApiResponse.error(res, {
                message: "Ada layanan yang tidak ditemukan",
                errors: null
            }, 404)
        }

        // Add layanan ke table reservasi_layanan
        await prisma.reservasi_layanan.createMany({
            data: layanan.map((it) => ({
                id_reservasi: idReservasi,
                id_layanan: it.id,
                id_fo: req.data?.user?.id!!,
                tanggal_pakai: new Date(),
                qty: it.qty,
                total: listLayanan.find((lay) => lay.id === it.id)?.tarif!! * it.qty
            }))
        })

        return ApiResponse.success(res, {
            message: "Berhasil memesan layanan",
            data: null
        })
    }

    static async catatanKeuangan(req: PegawaiRequest, res: Response) {
        const idReservasi = +req.params.id

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: idReservasi,
                status: 'checkin'
            },
            include: {
                reservasi_rooms: {
                    include: {
                        jenis_kamar: true
                    }
                },
                reservasi_layanan: {
                    include: {
                        layanan_tambahan: true
                    }
                },
                reservasi_cico: true
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan",
                errors: null
            }, 404)
        }

        // Grouping
        const kamarGrouped: { id: number, jenis_kamar: string, amount: number, harga: number }[] = []
        reservasi.reservasi_rooms.map((item) => {
            const existing = kamarGrouped.find((i) => i.id === item.id_jenis_kamar)
            if (existing) {
                existing.amount += 1
            } else {
                kamarGrouped.push({
                    id: item.id_jenis_kamar,
                    jenis_kamar: item.jenis_kamar.nama,
                    amount: 1,
                    harga: item.harga_per_malam
                })
            }
        })

        // @ts-ignore
        delete reservasi.reservasi_rooms

        const pajakLayanan = +(await Settings.get('PAJAK_LAYANAN'))

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data",
            data: {
                reservasi: reservasi,
                kamar: kamarGrouped,
                pajak_layanan_perc: pajakLayanan
            }
        })
    }

    static async checkOut(req: PegawaiRequest, res: Response) {
        const idReservasi = +req.params.id

        const validation = Validation.body(req, {
            total_dibayar: {
                required: true,
                type: 'number'
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Total dibayar harus diisi",
                errors: validation.errors
            }, 422)
        }

        const { total_dibayar } = validation.validated()

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: idReservasi,
                status: 'checkin'
            },
            include: {
                reservasi_rooms: {
                    include: {
                        jenis_kamar: true
                    }
                },
                reservasi_layanan: {
                    include: {
                        layanan_tambahan: true
                    }
                },
                reservasi_cico: true,
                user_customer: true
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan",
                errors: null
            }, 404)
        }

        // Total
        const totalKamar = reservasi.total
        const totalLayanan = reservasi.reservasi_layanan.reduce((acc, it) => acc + it.total, 0)
        const pajakLayanan = +(await Settings.get('PAJAK_LAYANAN')) * totalLayanan
        const total = totalKamar + totalLayanan + pajakLayanan

        const uangMuka = reservasi.jumlah_dp ?? 0
        const deposit = reservasi.reservasi_cico?.deposit ?? 0
        const terbayar = uangMuka + deposit

        const selisih = total - terbayar

        if (+total_dibayar !== selisih) {
            return ApiResponse.error(res, {
                message: "Uang yang dibayar/dikembalikan tidak sesuai. Jika seharusnya sudah sesuai, coba refresh halaman.",
                errors: null
            }, 422)
        }

        // Insert ke invoice
        const noInvoice = await generateIdInvoice(reservasi.user_customer.type.toUpperCase() as 'G' | 'P')
        const invoice = await prisma.invoice.create({
            data: {
                id_reservasi: idReservasi,
                id_fo: req.data?.user?.id!!,
                no_invoice: noInvoice,
                tanggal_lunas: new Date(),
                total_kamar: totalKamar,
                total_layanan: totalLayanan,
                pajak_layanan: pajakLayanan,
                grand_total: total
            }
        })

        // Update status reservasi menjadi selesai
        await prisma.reservasi.update({
            where: {
                id: reservasi.id
            },
            data: {
                status: "selesai"
            }
        })

        return ApiResponse.success(res, {
            message: `Berhasil melakukan check out dan membuat invoice ${noInvoice}`,
            data: {
                invoice: invoice,
                reservasi: reservasi
            }
        })
    }
}

export const router = Router()
router.get('/ketersediaan', CheckInOutController.getListKetersediaanCurrently)
router.get('/checkin', CheckInOutController.getListCheckInToday)
router.get('/checkout', CheckInOutController.getListCheckOutToday)
router.get('/menginap', CheckInOutController.getListTamuMenginap)
router.get('/checkedout', CheckInOutController.getListTamuCheckedOut)
router.post('/checkin/:id', multerUploadDest.single('gambar_identitas'), CheckInOutController.checkIn)
router.post('/pesan-layanan/:id', CheckInOutController.pesanLayanan)
router.get('/catatan-keuangan/:id', CheckInOutController.catatanKeuangan)
router.post('/checkout/:id', CheckInOutController.checkOut)