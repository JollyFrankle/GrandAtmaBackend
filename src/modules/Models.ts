import { Prisma } from '@prisma/client'

export type UserCustomer = Prisma.user_customerCreateManyInput
export type UserPegawai = Prisma.user_pegawaiCreateManyInput
export type User = UserCustomer | UserPegawai
export type Tokens = Prisma.tokensCreateManyInput

export type Season = Prisma.seasonCreateManyInput
export type Tarif = Prisma.tarifCreateManyInput
export type JenisKamar = Prisma.jenis_kamarCreateManyInput
export type Kamar = Prisma.kamarCreateManyInput
export type LayananTambahan = Prisma.layanan_tambahanCreateManyInput

export type Reservasi = Prisma.reservasiCreateManyInput
export type ReservasiRooms = Prisma.reservasi_roomsCreateManyInput
export type ReservasiLayanan = Prisma.reservasi_layananCreateManyInput
export type ReservasiLogs = Prisma.reservasi_logsCreateManyInput
export type Invoice = Prisma.invoiceCreateManyInput

export interface JwtUserCustomer {
    user_type: 'c'
    id: number
    type: string
    username: string
    email: string
    token: string
    intent: Tokens["intent"]
}

export interface JwtUserPegawai {
    user_type: 'p'
    id: number
    role: string
    email: string
    token: string
    intent: Tokens["intent"]
}