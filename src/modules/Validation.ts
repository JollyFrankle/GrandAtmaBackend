import { Request } from "express";
import moment from "moment-timezone";

export default class Validation {
    private data: { [key: string]: any };
    errors: { [key: string]: string } = {};
    private validatedData: { [key: string]: any } = {};

    constructor(data: { [key: string]: string }) {
        this.data = data;
    }

    validate(rules: { [key: string]: ValidationRule }) {
        for (const rule in rules) {
            const value = this.data[rule];

            if (rules[rule].required && !value) {
                this.errors[rule] = `${rule} wajib diisi`;
            } else if (!value) {
                // no value and not required, ignore further checks
            } else if (rules[rule].minLength && value.length < rules[rule].minLength!!) {
                this.errors[rule] = `${rule} harus berisi minimal ${rules[rule].minLength} karakter`;
            } else if (rules[rule].maxLength && value.length > rules[rule].maxLength!!) {
                this.errors[rule] = `${rule} harus berisi maksimal ${rules[rule].maxLength} karakter`;
            } else if (rules[rule].in && !rules[rule].in!!.includes(value)) {
                this.errors[rule] = `${rule} harus salah satu dari ${rules[rule].in}`;
            } else {
                switch (rules[rule].type) {
                    case "email":
                        if (!value.includes("@")) {
                            this.errors[rule] = `${rule} harus berupa email yang valid`;
                        }
                        break;
                    case "number":
                        if (isNaN(value)) {
                            this.errors[rule] = `${rule} harus berupa angka`;
                        } else if (rules[rule].min && value < rules[rule].min!!) {
                            this.errors[rule] = `${rule} harus paling kecil ${rules[rule].min}`;
                        } else if (rules[rule].max && value > rules[rule].max!!) {
                            this.errors[rule] = `${rule} harus paling tinggi ${rules[rule].max}`;
                        } else {
                            // [OK] Validated
                            this.validatedData[rule] = +value
                        }
                        break;
                    case "timestamp":
                        const time = moment(value)
                        if (!time.isValid()) {
                            this.errors[rule] = `${rule} harus berupa tanggal yang valid`;
                        } else if (rules[rule].minDate && time.isBefore(rules[rule].minDate)) {
                            this.errors[rule] = `${rule} harus paling cepat ${rules[rule].minDate}`;
                        } else if (rules[rule].maxDate && time.isAfter(rules[rule].maxDate)) {
                            this.errors[rule] = `${rule} harus paling lambat ${rules[rule].maxDate}`;
                        } else {
                            // [OK] Validated
                            this.validatedData[rule] = time.toDate()
                        }
                        break;
                    case "date":
                        const date = moment(value).add(moment().utcOffset(), 'minutes')
                        if (!date.isValid()) {
                            this.errors[rule] = `${rule} harus berupa tanggal yang valid`;
                        } else if (rules[rule].minDate) {
                            if (typeof rules[rule].minDate === "string") {
                                const minDate = rules[rules[rule].minDate!! as string].type === 'date' ? moment(this.validatedData[rules[rule].minDate!! as string]) : moment(rules[rules[rule].minDate!! as string].minDate!!).add(moment().utcOffset(), 'minutes')
                            } else if (date.isBefore(rules[rule].minDate)) {
                                this.errors[rule] = `${rule} harus paling cepat ${rules[rule].minDate}`;
                            }
                        } else if (rules[rule].maxDate && date.isAfter(rules[rule].maxDate)) {
                            this.errors[rule] = `${rule} harus paling lambat ${rules[rule].maxDate}`;
                        } else {
                            // [OK] Validated
                            this.validatedData[rule] = date.toDate()
                        }
                        break;
                    case "array":
                        if (!Array.isArray(value)) {
                            this.errors[rule] = `${rule} harus berupa array`;
                        }
                        break;
                }

                if (!this.validatedData[rule] && rules[rule].customRule && rules[rule].customRule!!(value) !== null) {
                    this.errors[rule] = rules[rule].customRule!!(value)!!
                }
            }

            if (!this.validatedData[rule]) {
                this.validatedData[rule] = value;
            }
        }

        return this;
    }

    fails() {
        return Object.keys(this.errors).length > 0;
    }

    /**
     * Get validated data
     */
    validated() {
        return this.validatedData;
    }

    static body(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.body).validate(rules);
    }

    static query(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.query as { [key: string]: string }).validate(rules);
    }

    static params(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.params).validate(rules);
    }
}

interface ValidationRule {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    in?: any[];
    type?: "email" | "number" | "date" | "timestamp" | "array";
    min?: number;
    max?: number;
    minDate?: Date | moment.Moment | string;
    maxDate?: Date | moment.Moment | string;
    customRule?: (value: any) => string | null
}

interface ComparisonRule<T> {
    sign: '=' | '<' | '>' | '<=' | '>=' | '!=';
    value: T
}