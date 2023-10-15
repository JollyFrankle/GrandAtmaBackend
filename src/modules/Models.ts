import { Prisma } from '@prisma/client'

export type UserCustomer = Required<Prisma.user_customerCreateManyInput>
export type UserPegawai = Required<Prisma.user_pegawaiCreateManyInput>
export type User = UserCustomer | UserPegawai
export type AuthTokens = Required<Prisma.auth_tokensCreateManyInput>

export type Season = Required<Prisma.seasonCreateManyInput>
export type Tarif = Required<Prisma.tarifCreateManyInput>
export type JenisKamar = Required<Prisma.jenis_kamarCreateManyInput>
export type Kamar = Required<Prisma.kamarCreateManyInput>
export type LayananTambahan = Required<Prisma.layanan_tambahanCreateManyInput>

export type Reservasi = Required<Prisma.reservasiCreateManyInput>
export type ReservasiRooms = Required<Prisma.reservasi_roomsCreateManyInput>
export type ReservasiLayanan = Required<Prisma.reservasi_layananCreateManyInput>
export type ReservasiLogs = Required<Prisma.reservasi_logsCreateManyInput>
export type Invoice = Required<Prisma.invoiceCreateManyInput>

export interface JwtUserCustomer {
    user_type: 'c'
    id: number
    type: string
    username: string
    email: string
    token: string
}

export interface JwtUserPegawai {
    user_type: 'p'
    id: number
    role: string
    username: string
    token: string
}