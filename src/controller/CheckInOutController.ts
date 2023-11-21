import { Request, Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { Kamar, Reservasi, ReservasiLayanan, ReservasiRooms } from "../modules/Models";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import moment from "moment-timezone";

interface KamarAvailibility {
    no_kamar: string,
    reservasi: Reservasi | null,
    status: 'TSD' | 'TRS' | 'COT' | 'UNV'
}

interface CheckInKamar {
    id_rr: number,
    no_kamar: number,
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
        ]
    })

    const roomsToday = await prisma.reservasi_rooms.findMany({
        where: {
            reservasi: {
                status: 'checkin',
                checked_in: {
                    lte: new Date()
                },
                departure_date: {
                    gte: new Date()
                }
            }
        },
        include: {
            reservasi: {
                include: {
                    user_customer: true
                }
            }
        }
    })

    /**
     * TSD = Tersedia
     * TRS = Terisi
     * COT = Check Out Today
     * UNV = Unavailable
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

            if (moment(reservasi.checked_out).isSame(moment(), 'day')) {
                status = 'COT'
            }
        }

        availibility.push({
            no_kamar: kamar.no_kamar,
            reservasi: reservasi ?? null,
            status: status
        })
    })

    return availibility
}

function getTanggalCheckInHariIni() {
    // tanggal check in = kemarin kalau < 12.00, hari ini kalau >= 12.00
    const jamCheckOut = 12
    const hariIni = moment()
    if (hariIni.hour() < jamCheckOut) {
        hariIni.subtract(1, 'day')
    }

    return hariIni.set({
        h: 14,
        m: 0,
        s: 0,
        ms: 0
    }).toDate()
}

function getTanggalCheckOutHariIni() {
    // tanggal check out = hari ini kalau < 12.00, besok kalau >= 12.00
    const jamCheckOut = 12
    const hariIni = moment()
    if (hariIni.hour() >= jamCheckOut) {
        hariIni.add(1, 'day')
    }

    return hariIni.set({
        h: 12,
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

        const tglHariIni = getTanggalCheckInHariIni()
        const reservasi = await prisma.reservasi.findMany({
            where: {
                status: {
                    in: ['lunas', 'dp'] // hanya yg sudah lunas/DP yang boleh check in
                },
                checked_in: null, // kalau sudah check in, tidak boleh check in lagi
                arrival_date: {
                    lte: tglHariIni // arrival hari ini atau kemarin boleh check in (kalau sudah > jam check out auto diset BATAL: ditangani cron job)
                },
                departure_date: {
                    gt: tglHariIni // departure hari ini atau <= kemarin boleh check out (kalau sudah > jam check out auto diset BATAL, ditangani cron job)
                }
            },
            orderBy: {
                arrival_date: 'desc' // biar tampil hari ini duluan, yang kemarin-kemarin terakhir
            },
            include: {
                user_customer: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check in hari ini',
            data: {
                tanggal: tglHariIni,
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
                user_customer: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check out hari ini',
            data: {
                tanggal: tglHariIni,
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

    static async checkIn(req: PegawaiRequest, res: Response) {
        const validation = Validation.body(req, {
            id: {
                required: true,
                type: 'number'
            },
            deposit: {
                required: true,
                type: 'number',
                min: 300000
            },
            kamar: {
                required: true,
                type: "array",
                customRule: (value) => {
                    const rooms = value as CheckInKamar[]

                    return rooms.filter((it) => !it.id_rr || !it.no_kamar || typeof it.new_id_jk === "undefined").length > 0 ? 'Request malformed untuk kamar!' : null
                }
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { id, deposit, kamar } = validation.validated()
        const rooms = kamar as CheckInKamar[]

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: id,
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

        const ketersediaanSaatIni = await getKeterisianKamarHariIni()
        // for ()
    }
}

export const router = Router()
router.get('/ketersediaan', CheckInOutController.getListKetersediaanCurrently)
router.get('/checkin', CheckInOutController.getListCheckInToday)
router.get('/checkout', CheckInOutController.getListCheckOutToday)
router.get('/menginap', CheckInOutController.getListTamuMenginap)