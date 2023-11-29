import { Request, Response, Router } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import puppeteer, { Browser } from "puppeteer";
import hbs from "handlebars";
import fs from "fs";
import Utils from "../modules/Utils";
import LaporanContent from "../modules/LaporanContent";
import Authentication from "../modules/Authentication";
import { JwtUserPegawai, UserPegawai } from "../modules/Models";

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
        // Register partials
        hbs.registerPartial('kop', getTemplate('KopHeader'))
        hbs.registerPartial('style', getTemplate('Style'))
        hbs.registerHelper('b64Logo', () => new hbs.SafeString(getB64Image("gah-logo.webp")))
        hbs.registerHelper("offset", (index: number, offset: number) => index + offset)
        hbs.registerHelper("json", (data: any) => JSON.stringify(data))

        // Browser
        let _browser: Promise<Browser>
        if (PdfController.browser) {
            // close browser
            await PdfController.browser.close()
        }

        try {
            if (process.env.USES_LOCAL_CHROME === "true") {
                _browser = puppeteer.launch({
                    args: ['--no-sandbox'],
                    headless: "new",
                    defaultViewport: {
                        width: 595,
                        height: 842,
                        deviceScaleFactor: 2
                    }
                })
            } else {
                const params = new URLSearchParams({
                    token: process.env.BROWSERLESS_TOKEN ?? "",
                    "--user-data-dir": "/tmp",
                    blockAds: "true"
                })
                _browser = puppeteer.connect({
                    browserWSEndpoint: `wss://chrome.browserless.io?${params.toString()}`,
                    protocolTimeout: 60000,
                    defaultViewport: {
                        width: 595,
                        height: 842,
                        deviceScaleFactor: 2
                    }
                })
            }

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
                permintaan_tambahan: permintaanTambahan.trim()
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
            })
        })

        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '.5in',
                bottom: '.5in',
                left: '.5in',
                right: '.5in'
            }
        })

        await page.close()
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
        res.setHeader('Content-Disposition', `inline; filename=Invoice-${invoice.no_invoice}.pdf`);
        // Force download:
        // res.setHeader('Content-Disposition', `attachment; filename=Invoice-${invoice.no_invoice}.pdf`);

        const page = await PdfController.browser.newPage()

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
            denda: invoice.denda_overstay > 0 ? Utils.currencyFormat.format(invoice.denda_overstay) : null,
            kembalian: selisih < 0 ? Utils.currencyFormat.format(-selisih) : null,
            kekurangan: selisih > 0 ? Utils.currencyFormat.format(selisih) : null
        })

        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '.5in',
                bottom: '.5in',
                left: '.5in',
                right: '.5in'
            }
        })

        await page.close()
        return res.send(pdf)
    }

    static async laporan(req: Request, res: Response) {
        const { noLap } = req.params
        const query = req.query

        if (!req.query.token) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        const decodedToken = Authentication.decodeToken<JwtUserPegawai>(req.query.token.toString())
        if (!decodedToken) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        const user = await Authentication.getUserFromToken(decodedToken, 'auth', 'p') as UserPegawai | undefined
        if (["gm", "owner"].indexOf(user?.role ?? "") === -1) {
            return ApiResponse.error(res, {
                message: "Unauthorized",
                errors: null
            }, 401)
        }

        if (!query.tahun || isNaN(+query.tahun) || +query.tahun <= 0) {
            return ApiResponse.error(res, {
                message: "Tahun tidak valid",
                errors: null
            }, 422)
        }

        const tahun = +query.tahun

        let data
        let total: string | undefined = undefined
        let grafik: string | undefined = undefined
        switch(+noLap) {
            case 1:
                data = await LaporanContent.laporan1(tahun)
                total = data.data.reduce((acc, cur) => acc + cur.jumlah, 0).toString()
                break
            case 2:
                data = await LaporanContent.laporan2(tahun)
                total = Utils.currencyFormat.format(data.data.reduce((acc, cur) => acc + cur.total, 0))

                grafik = getTemplate("laporan-grafik/GrafikL2")({
                    labels: data.data.map((d) => d.bulan),
                    data: {
                        grup: data.data.map((d) => d.grup),
                        personal: data.data.map((d) => d.personal),
                        total: data.data.map((d) => d.total)
                    }
                })

                data.data.forEach((d) => {
                    // @ts-ignore
                    d.total = Utils.numberFormat.format(d.total)
                    // @ts-ignore
                    d.grup = Utils.numberFormat.format(d.grup)
                    // @ts-ignore
                    d.personal = Utils.numberFormat.format(d.personal)
                })
                break
            case 3:
                if (!query.bulan || +query.bulan <= 0) {
                    return ApiResponse.error(res, {
                        message: "Bulan tidak valid",
                        errors: null
                    }, 422)
                }
                const bulan = +query.bulan
                data = await LaporanContent.laporan3(tahun, bulan)
                total = Utils.numberFormat.format(data.data.reduce((acc, cur) => acc + cur.total, 0))

                grafik = getTemplate("laporan-grafik/GrafikL3")({
                    labels: data.data.map((d) => d.jenis_kamar),
                    data: {
                        grup: data.data.map((d) => d.grup),
                        personal: data.data.map((d) => d.personal),
                        total: data.data.map((d) => d.total)
                    }
                })
                break
            case 4:
                data = await LaporanContent.laporan4(tahun)
                data.data.forEach((d) => {
                    // @ts-ignore
                    d.total_pembayaran = Utils.numberFormat.format(d.total_pembayaran)
                })
                break
            default:
                return ApiResponse.error(res, {
                    message: "Laporan tidak ditemukan",
                    errors: null
                }, 404)
        }

        let footer
        if (total !== undefined) {
            footer = [
                {
                    colspan: data?.headers.length ? data?.headers.length - 1 : undefined,
                    text: 'Total',
                    style: `text-align: end;`
                },
                {
                    text: total,
                    style: `text-align: end; font-weight: bold;`
                }
            ]
        }

        const tpl = {
            ...data,
            footer,
            tanggal: Utils.dateFormatDate.format(new Date()),
            raw_grafik: grafik
        }

        const template = getTemplate('Laporan')
        const html = template(tpl)

        if (!query.readonly) {
            if (!PdfController.browser) {
                return ApiResponse.error(res, {
                    message: "Terjadi kesalahan, silahkan coba beberapa saat lagi atau hubungi admin jika masalah masih belum teratasi",
                    errors: null
                }, 500)
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${data.title} (${Utils.dateFormatFull.format(new Date())}).pdf"`);
            // Force download:
            // res.setHeader('Content-Disposition', `attachment; filename=TandaTerima-${reservasi.id_booking}.pdf`);

            const page = await PdfController.browser.newPage()
            await page.setContent(html, { waitUntil: 'domcontentloaded' })

            const pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '.5in',
                    bottom: '.5in',
                    left: '.5in',
                    right: '.5in'
                }
            })

            await page.close()
            return res.send(pdf)
        } else {
            res.setHeader('Content-Type', 'text/html');
            return res.send(html)
        }
    }
}

export const router = Router()
router.get('/tanda-terima/:b64id', PdfController.showPdfTandaTerima)
router.get('/invoice/:b64id', PdfController.showPdfInvoice)
router.get('/laporan/:noLap', PdfController.laporan)