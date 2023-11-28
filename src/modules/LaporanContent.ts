import { prisma } from "./PrismaService"

const formatterMonth = new Intl.DateTimeFormat('id-ID', {
    month: 'long'
})

export default class LaporanContent {
    /**
     * Laporan customer baru per bulan
     */
    static async laporan1(tahun: number) {
        const laporanRaw = await prisma.$queryRaw`
        SELECT MONTH(created_at) AS bulan, COUNT(*) AS jumlah FROM user_customer
        WHERE YEAR(created_at) = ${tahun}
        GROUP BY bulan;
    ` as { bulan: number, jumlah: BigInt }[]

        const data: { no: number, bulan: string, jumlah: number }[] = []

        for (let i = 1; i <= 12; i++) {
            const bulan = laporanRaw.find(l => l.bulan === i)
            data.push({
                no: i,
                bulan: formatterMonth.format(new Date(tahun, i - 1)),
                jumlah: bulan ? Number(bulan.jumlah) : 0
            })
        }

        return {
            title: "Laporan Customer Baru",
            meta: [
                {
                    text: "Tahun",
                    value: tahun
                }
            ],
            note: null,
            headers: [
                { text: 'No', value: 'no', tdCss: `text-align: center;` },
                { text: 'Bulan', value: 'bulan' },
                { text: 'Jumlah', value: 'jumlah', tdCss: `text-align: end;` }
            ],
            data
        }
    }

    /**
     * Laporan Pendapatan Bulanan:
     * 1. Pendapatan dari reservasi
     *    - Rumus: `SUM of (uang muka)`
     *    - Sesuai dengan tanggal dp
     * 2. Pendapatan dari invoice
     *    - Rumus: `SUM of ((total harga kamar - uang muka) + layanan + pajak layanan)`
     *    - Sesuai dengan tanggal lunas
     *
     * Deposit tidak dihitung karena sudah dikembalikan waktu check out atau digunakan untuk membayar layanan
     */
    static async laporan2(tahun: number) {
        const rawReservasi = await prisma.$queryRaw`
            SELECT MONTH(tanggal_dp) AS bulan, LEFT(id_booking, 1) AS type, SUM(jumlah_dp) AS total FROM reservasi
            WHERE YEAR(tanggal_dp) = ${tahun}
            GROUP BY bulan, type;
        ` as { bulan: number, type: string, total: string }[]

        const rawInvoice = await prisma.$queryRaw`
            SELECT MONTH(tanggal_lunas) AS bulan, LEFT(no_invoice, 1) AS type, SUM((A.total_kamar - (SELECT B.jumlah_dp FROM reservasi B WHERE B.id = A.id_reservasi)) + total_layanan) AS total FROM invoice A
            WHERE YEAR(tanggal_lunas) = ${tahun}
            GROUP BY bulan, type;
        ` as { bulan: number, type: string, total: string }[]

        const data: { no: number, bulan: string, grup: number, personal: number, total: number }[] = []

        for (let i = 1; i <= 12; i++) {
            const bulan = rawReservasi.filter(l => l.bulan === i) // get semua di bulan ini (i.e [{bulan: 1, type: 'G', total: 10000}, {bulan: 1, type: 'P', total: 20000}])
            const grup = +(bulan.find(l => l.type === 'G')?.total ?? 0)
            const personal = +(bulan.find(l => l.type === 'P')?.total ?? 0)
            const total = grup + personal

            data.push({
                no: i,
                bulan: formatterMonth.format(new Date(tahun, i - 1)),
                grup: Number(grup),
                personal: Number(personal),
                total: Number(total)
            })
        }

        // Invoice
        for (let i = 1; i <= 12; i++) {
            const bulan = rawInvoice.filter(l => l.bulan === i) // get semua di bulan ini (i.e [{bulan: 1, type: 'G', total: 10000}, {bulan: 1, type: 'P', total: 20000}])
            const grup = +(bulan.find(l => l.type === 'G')?.total ?? 0)
            const personal = +(bulan.find(l => l.type === 'P')?.total ?? 0)
            const total = grup + personal

            data[i - 1].grup += Number(grup)
            data[i - 1].personal += Number(personal)
            data[i - 1].total += Number(total)
        }

        return {
            title: "Laporan Pendapatan Bulanan",
            meta: [
                {
                    text: "Tahun",
                    value: tahun
                }
            ],
            note: "Pendapatan dari reservasi dihitung berdasarkan tanggal dp, sedangkan pendapatan dari invoice dihitung berdasarkan tanggal lunas. Pendapatan yang dihitung adalah pendapatan bersih (tidak termasuk pajak).",
            headers: [
                { text: 'No', value: 'no', tdCss: `text-align: center;` },
                { text: 'Bulan', value: 'bulan' },
                { text: 'Grup (Rp)', value: 'grup', tdCss: `text-align: end;` },
                { text: 'Personal (Rp)', value: 'personal', tdCss: `text-align: end;` },
                { text: 'Total (Rp)', value: 'total', tdCss: `text-align: end;` }
            ],
            data
        }
    }

    /**
     * Laporan Kamar Dipesan per Bulan
     */
    static async laporan3(tahun: number, bulan: number) {
        const data: { no: number, jenis_kamar: string, grup: number, personal: number, total: number }[] = []

        const rawLaporan = await prisma.$queryRaw`
            SELECT B.id_jenis_kamar AS id_jk, D.nama AS jenis_kamar, C.type AS type, COUNT(B.id) AS jumlah FROM reservasi A
            INNER JOIN reservasi_rooms B ON B.id_reservasi = A.id
            INNER JOIN user_customer C ON C.id = A.id_customer
            INNER JOIN jenis_kamar D ON D.id = B.id_jenis_kamar
            WHERE YEAR(A.arrival_date) = ${tahun}
            AND MONTH(A.arrival_date) = ${bulan}
            GROUP BY id_jk, type
            ORDER BY B.id_jenis_kamar ASC;
        ` as { id_jk: number, jenis_kamar: string, type: 'g' | 'p', jumlah: BigInt }[]

        let nomor = 1
        for (let i in rawLaporan) {
            const lap = rawLaporan[i]
            if (data.find(d => d.jenis_kamar === lap.jenis_kamar)) {
                const index = data.findIndex(d => d.jenis_kamar === lap.jenis_kamar)
                data[index].grup += lap.type === 'g' ? Number(lap.jumlah) : 0
                data[index].personal += lap.type === 'p' ? Number(lap.jumlah) : 0
                data[index].total += Number(lap.jumlah)
            } else {
                data.push({
                    no: nomor++,
                    jenis_kamar: lap.jenis_kamar,
                    grup: lap.type === 'g' ? Number(lap.jumlah) : 0,
                    personal: lap.type === 'p' ? Number(lap.jumlah) : 0,
                    total: Number(lap.jumlah)
                })
            }
        }

        return {
            title: "Laporan Kamar Dipesan per Bulan",
            meta: [
                {
                    text: "Tahun",
                    value: tahun
                },
                {
                    text: "Bulan",
                    value: formatterMonth.format(new Date(tahun, bulan - 1))
                }
            ],
            note: "Jumlah kamar dipesan dihitung berdasarkan tanggal kedatangan reservasi.",
            headers: [
                { text: 'No', value: 'no', tdCss: `text-align: center;` },
                { text: 'Jenis Kamar', value: 'jenis_kamar' },
                { text: 'Grup', value: 'grup', tdCss: `text-align: end;` },
                { text: 'Personal', value: 'personal', tdCss: `text-align: end;` },
                { text: 'Total', value: 'total', tdCss: `text-align: end;` }
            ],
            data
        }
    }

    /**
     * Laporan 5 customer dengan reservasi terbanyak [AMBIGU]
     * - Jumlah reservasi: hanya menghitung reservasi yang sudah selesai
     * - Total pembayaran: grand total dari invoice
     * - Sesuai dengan tanggal pembuatan reservasi
     */
    static async laporan4(tahun: number) {
        // const rawLaporan = await prisma.$queryRaw`
        //     SELECT B.type AS tipe_customer, B.nama AS nama_customer, COUNT(A.id) AS jumlah_reservasi, SUM(A.jumlah_dp) AS total_pembayaran_kamar FROM reservasi A
        //     INNER JOIN user_customer B ON A.id_customer = B.id
        //     GROUP BY B.id;
        // ` as { tipe_customer: 'g' | 'p', nama_customer: string, jumlah_reservasi: BigInt, total_pembayaran_kamar: string }[]

        const rawLaporan = await prisma.$queryRaw`
            SELECT B.type AS tipe_customer, B.nama AS nama_customer, COUNT(A.id) AS jumlah_reservasi, SUM(A.total + IF(C.total_layanan IS NULL, 0, C.total_layanan)) AS total_pembayaran FROM reservasi A
            INNER JOIN user_customer B ON A.id_customer = B.id
            LEFT JOIN invoice C ON B.id = C.id_reservasi
            WHERE A.status NOT IN("batal", "expired") # ambigu
            AND YEAR(B.created_at) = ${tahun} # ambigu
            GROUP BY B.id
            ORDER BY total_pembayaran DESC
            LIMIT 5;
        ` as { tipe_customer: 'g' | 'p', nama_customer: string, jumlah_reservasi: BigInt, total_pembayaran: string }[]

        const data: { no: number, tipe: string, nama: string, jumlah_reservasi: number, total_pembayaran: number }[] = []

        for (let i in rawLaporan) {
            const lap = rawLaporan[i]
            data.push({
                no: Number(i) + 1,
                tipe: lap.tipe_customer === 'g' ? 'Grup' : 'Personal',
                nama: lap.nama_customer,
                jumlah_reservasi: Number(lap.jumlah_reservasi),
                total_pembayaran: Number(lap.total_pembayaran)
            })
        }

        return {
            title: "Laporan 5 Customer dengan Reservasi Terbanyak",
            meta: [
                {
                    text: "Tahun",
                    value: tahun
                }
            ],
            headers: [
                { text: 'No', value: 'no', tdCss: `text-align: center;` },
                { text: 'Tipe', value: 'tipe' },
                { text: 'Nama', value: 'nama' },
                { text: 'Jumlah Reservasi', value: 'jumlah_reservasi', tdCss: `text-align: end;` },
                { text: 'Total Pembayaran (Rp)', value: 'total_pembayaran', tdCss: `text-align: end;` }
            ],
            data
        }
    }
}