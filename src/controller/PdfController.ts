import { Request, Response, Router } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
// import puppeteer, { Browser } from "puppeteer";
import puppeteer, { Browser } from "puppeteer-core";
import hbs from "handlebars";
import fs from "fs";
import Utils from "../modules/Utils";

function getTemplate(name: string) {
    const file = fs.readFileSync(`${__dirname}/../../handlebars/${name}.hbs`, 'utf-8')
    return hbs.compile(file)
}

function getB64Image(image: string) {
    const mime = image.split(".")[1]
    const content = fs.readFileSync(`${__dirname}/../../public/images/${image}`, { encoding: 'base64' })
    return `data:image/${mime};base64,${content}`
}

export default class PdfController {
    static browser: Browser | null = null

    static async init() {
        let _browser: Promise<Browser>
        try {
            // _browser = puppeteer.launch({
            //     args: ['--no-sandbox'],
            //     headless: "new"
            // })

            _browser = puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
            })

            _browser.catch((err) => {
                console.error("Error launching browser", err)
            })

            PdfController.browser = await _browser
        } catch (err: any) {
            console.error("Error launching browser", err)
        }
    }

    static async showPdfTandaTerima(req: Request, res: Response) {
        const { b64id } = req.params

        if (!b64id) {
            return ApiResponse.error(res, {
                message: "ID tidak ditemukan",
                errors: null
            }, 422)
        }

        // Decode base64
        const buff = Buffer.from(b64id, 'base64')
        const [idR, idC, idBooking] = buff.toString('utf-8').split(",")

        if (!idR || !idC || !idBooking) {
            return ApiResponse.error(res, {
                message: "ID tidak ditemukan",
                errors: null
            }, 422)
        }

        const reservasi = await prisma.reservasi.findFirst({
            where: {
                id: +idR,
                id_customer: +idC,
                id_booking: idBooking
            },
            include: {
                user_customer: true,
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
                user_pegawai: true
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Data tidak ditemukan",
                errors: null
            }, 404)
        }

        const roomsGrouped: { id_jk: number, nama_jk: string, harga_per_malam: number, jumlah_kamar: number }[] = []
        reservasi.reservasi_rooms.forEach((room) => {
            const rr = roomsGrouped.find((r) => r.id_jk === room.jenis_kamar?.id)
            if (rr) {
                rr.jumlah_kamar += 1
            } else {
                roomsGrouped.push({
                    id_jk: room.id_jenis_kamar,
                    nama_jk: room.jenis_kamar?.nama!!,
                    harga_per_malam: room.harga_per_malam,
                    jumlah_kamar: 1
                })
            }
        })

        let permintaanTambahan = ""
        if (reservasi.permintaan_tambahan) {
            permintaanTambahan += reservasi.permintaan_tambahan
        }
        if (reservasi.reservasi_layanan.length > 0) {
            reservasi.reservasi_layanan.forEach((rl) => {
                permintaanTambahan += `\n- ${rl?.qty} ${rl.layanan_tambahan?.satuan} ${rl.layanan_tambahan?.nama}`
            })
        }
        if (!permintaanTambahan.trim()) {
            permintaanTambahan = "Tidak ada"
        }

        if (!PdfController.browser) {
            return ApiResponse.error(res, {
                message: "Terjadi kesalahan, silahkan coba beberapa saat lagi atau hubungi admin jika masalah masih belum teratasi",
                errors: null
            }, 500)
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=TandaTerima-${reservasi.id_booking}.pdf`);
        // Force download:
        // res.setHeader('Content-Disposition', `attachment; filename=TandaTerima-${reservasi.id_booking}.pdf`);

        const page = await PdfController.browser.newPage()
        const b64Logo = getB64Image("gah-logo.webp")

        const template = getTemplate('TandaTerimaReservasi')
        const html = template({
            detail_tt: {
                id_booking: reservasi.id_booking,
                pic_sm: reservasi.user_pegawai?.nama,
                nama_customer: reservasi.user_customer?.nama,
                alamat_customer: reservasi.user_customer?.alamat,
                tanggal_dibuat: Utils.dateFormatDate.format(reservasi.created_at),
                total_harga_kamar: Utils.currencyFormat.format(reservasi.total),
                uang_jaminan: Utils.currencyFormat.format(reservasi.jumlah_dp ?? 0),
                permintaan_tambahan: permintaanTambahan
            },
            detail_pemesanan: {
                check_in: Utils.dateFormatDate.format(reservasi.arrival_date),
                check_out: Utils.dateFormatDate.format(reservasi.departure_date),
                jumlah_dewasa: reservasi.jumlah_dewasa,
                jumlah_anak: reservasi.jumlah_anak,
                tanggal_dp: Utils.dateFormatDate.format(reservasi.tanggal_dp ?? new Date())
            },
            kamar: roomsGrouped.map((rr) => {
                return {
                    jenis_kamar: rr.nama_jk,
                    jumlah_malam: reservasi.jumlah_malam,
                    jumlah_kamar: rr.jumlah_kamar,
                    harga: Utils.currencyFormat.format(rr.harga_per_malam),
                    total: Utils.currencyFormat.format(rr.harga_per_malam * reservasi.jumlah_malam!! * rr.jumlah_kamar)
                }
            }),
            b64Logo: b64Logo
        })

        await page.setContent(html)

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '1cm',
                bottom: '1cm',
                left: '1cm',
                right: '1cm'
            }
        })

        return res.send(pdf)
    }

    static async showPdfInvoice(req: Request, res: Response) {
        const { b64id } = req.params

        if (!b64id) {
            return ApiResponse.error(res, {
                message: "ID tidak ditemukan",
                errors: null
            }, 422)
        }

        // Decode base64
        const buff = Buffer.from(b64id, 'base64')
        const [idR, noInvoice] = buff.toString('utf-8').split(",")

        if (!idR || !noInvoice) {
            return ApiResponse.error(res, {
                message: "ID tidak ditemukan",
                errors: null
            }, 422)
        }

        const invoice = await prisma.invoice.findFirst({
            where: {
                id_reservasi: +idR,
                no_invoice: noInvoice
            },
            include: {
                reservasi: {
                    include: {
                        user_customer: true,
                        reservasi_rooms: {
                            include: {
                                jenis_kamar: true,
                                kamar: true
                            }
                        },
                        reservasi_layanan: {
                            include: {
                                layanan_tambahan: true
                            }
                        },
                        user_pegawai: true,
                        reservasi_cico: true
                    }
                },
                user_pegawai: true
            }
        })

        if (!invoice) {
            return ApiResponse.error(res, {
                message: "Data tidak ditemukan",
                errors: null
            }, 404)
        }

        const reservasi = invoice.reservasi

        const roomsGrouped: { id_jk: number, nama_jk: string, bed: string, harga_per_malam: number, jumlah_kamar: number }[] = []
        reservasi.reservasi_rooms.forEach((room) => {
            const rr = roomsGrouped.find((r) => r.id_jk === room.jenis_kamar?.id && r.bed === room.kamar?.jenis_bed)
            if (rr) {
                rr.jumlah_kamar += 1
            } else {
                roomsGrouped.push({
                    id_jk: room.id_jenis_kamar,
                    bed: room.kamar?.jenis_bed!!,
                    nama_jk: room.jenis_kamar?.nama!!,
                    harga_per_malam: room.harga_per_malam,
                    jumlah_kamar: 1
                })
            }
        })

        const totalKamar = reservasi.total
        const totalLayanan = invoice.total_layanan
        const pajakLayanan = invoice.pajak_layanan
        const total = totalKamar + totalLayanan + pajakLayanan

        const uangMuka = reservasi.jumlah_dp ?? 0
        const deposit = reservasi.reservasi_cico?.deposit ?? 0
        const terbayar = uangMuka + deposit

        const selisih = total - terbayar

        if (!PdfController.browser) {
            return ApiResponse.error(res, {
                message: "Terjadi kesalahan, silahkan coba beberapa saat lagi atau hubungi admin jika masalah masih belum teratasi",
                errors: null
            }, 500)
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=TandaTerima-${reservasi.id_booking}.pdf`);
        // Force download:
        // res.setHeader('Content-Disposition', `attachment; filename=TandaTerima-${reservasi.id_booking}.pdf`);

        const page = await PdfController.browser.newPage()
        const b64Logo = getB64Image("gah-logo.webp")

        const template = getTemplate('Invoice')
        const html = template({
            detail_tt: {
                id_booking: reservasi.id_booking,
                nama_customer: reservasi.user_customer?.nama,
                alamat_customer: reservasi.user_customer?.alamat,
                total_harga_kamar: Utils.currencyFormat.format(reservasi.total),
                uang_jaminan: Utils.currencyFormat.format(reservasi.jumlah_dp ?? 0),
                deposit: Utils.currencyFormat.format(reservasi.reservasi_cico?.deposit ?? 0),
            },
            detail_pemesanan: {
                check_in: Utils.dateFormatDate.format(reservasi.arrival_date),
                check_out: Utils.dateFormatDate.format(reservasi.departure_date),
                jumlah_dewasa: reservasi.jumlah_dewasa,
                jumlah_anak: reservasi.jumlah_anak,
            },
            kamar: roomsGrouped.map((rr) => {
                return {
                    jenis_kamar: rr.nama_jk,
                    jenis_bed: rr.bed,
                    jumlah_malam: reservasi.jumlah_malam,
                    jumlah_kamar: rr.jumlah_kamar,
                    harga: Utils.currencyFormat.format(rr.harga_per_malam),
                    total: Utils.currencyFormat.format(rr.harga_per_malam * reservasi.jumlah_malam!! * rr.jumlah_kamar)
                }
            }),
            layanan: reservasi.reservasi_layanan.map((rl) => {
                return {
                    nama: rl.layanan_tambahan?.nama,
                    tanggal: Utils.dateFormatDate.format(rl.tanggal_pakai),
                    jumlah: rl.qty,
                    harga: Utils.currencyFormat.format(rl.total / rl.qty),
                    total: Utils.currencyFormat.format(rl.total)
                }
            }),
            detail_inv: {
                no_invoice: invoice.no_invoice,
                tanggal: Utils.dateFormatDate.format(invoice.tanggal_lunas),
                nama_fo: invoice.user_pegawai?.nama,
                pajak_layanan: Utils.currencyFormat.format(invoice.pajak_layanan),
                total_layanan: Utils.currencyFormat.format(invoice.total_layanan),
                grand_total: Utils.currencyFormat.format(invoice.grand_total)
            },
            kembalian: selisih < 0 ? Utils.currencyFormat.format(selisih) : null,
            kekurangan: selisih > 0 ? Utils.currencyFormat.format(selisih) : null,
            b64Logo: b64Logo
        })

        await page.setContent(html)

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '1cm',
                bottom: '1cm',
                left: '1cm',
                right: '1cm'
            }
        })

        return res.send(pdf)
    }
}

export const router = Router()
router.get('/tanda-terima/:b64id', PdfController.showPdfTandaTerima)
router.get('/invoice/:b64id', PdfController.showPdfInvoice)

hbs.registerPartial('kop', getTemplate('KopHeader'))