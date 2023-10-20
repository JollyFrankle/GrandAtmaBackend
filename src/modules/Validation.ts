import { Request } from "express";
import moment from "moment-timezone";

function momentOrDateToDate(input: moment.Moment | Date, type: 'datetime' | 'timestamp') {
    if (input instanceof Date) {
        return input
    } else {
        return type === 'datetime' ? input.toDate() : input.add(moment().utcOffset(), 'minutes').toDate()
    }
}

function stringToDate(input: string, type: 'datetime' | 'timestamp') {
    return type === 'datetime' ? moment(input).add(moment().utcOffset(), 'minutes').toDate() : moment(input).toDate()
}

export default class Validation {
    private data: KeyValue<any>;
    errors: KeyValue<string> = {};
    private validatedData: KeyValue<any> = {};
    private rules: KeyValue<ValidationRule> = {};

    constructor(data: KeyValue<string>, rules: KeyValue<ValidationRule> = {}) {
        this.data = data;
        this.rules = rules;
    }

    private vrDate(key: string, type: 'datetime' | 'timestamp') {
        // Validation rule for datetime and timestamp
        const rule = this.rules[key];
        const value = this.data[key];
        const date = type === 'datetime' ? moment(value).add(moment().utcOffset(), 'minutes') : moment(value)

        if (!date.isValid()) {
            this.errors[key] = `${key} harus berupa tanggal yang valid`;
        } else if (rule.minDate || rule.maxDate) {
            if (rule.minDate) {
                if (typeof rule.minDate === "string") {
                    // if minDate is a string, it must be a key of rules
                    const minDate = stringToDate(this.validatedData[rule.minDate!! as string], type)
                    if (date.isBefore(minDate)) {
                        this.errors[key] = `${key} tidak boleh sebelum ${rule.minDate}`;
                    }
                } else if (date.isBefore(momentOrDateToDate(rule.minDate, type))) {
                    // if date | moment
                    this.errors[key] = `${key} harus paling cepat ${rule.minDate}`;
                }
            } else if (rule.maxDate) {
                if (typeof rule.maxDate === "string") {
                    // if maxDate is a string, it must be a key of rules
                    const maxDate = stringToDate(this.validatedData[rule.maxDate!! as string], type)
                    if (date.isAfter(maxDate)) {
                        this.errors[key] = `${key} tidak boleh setelah ${rule.maxDate}`;
                    }
                } else if (date.isAfter(momentOrDateToDate(rule.maxDate, type))) {
                    // if date | moment
                    this.errors[key] = `${key} harus paling lambat ${rule.maxDate}`;
                }
            }
        }

        if (!this.errors[key]) {
            this.validatedData[key] = date.toDate()
        }
    }

    validate() {
        for (const key in this.rules) {
            const value = this.data[key];
            const rule = this.rules[key];

            if (rule.required && !value) {
                this.errors[key] = `${key} wajib diisi`;
            } else if (!value) {
                // no value and not required, ignore further checks
            } else if (rule.minLength && value.length < rule.minLength!!) {
                this.errors[key] = `${key} harus berisi minimal ${rule.minLength} karakter`;
            } else if (rule.maxLength && value.length > rule.maxLength!!) {
                this.errors[key] = `${key} harus berisi maksimal ${rule.maxLength} karakter`;
            } else if (rule.in && !rule.in!!.includes(value)) {
                this.errors[key] = `${key} harus salah satu dari ${rule.in}`;
            } else {
                switch (rule.type) {
                    case "email":
                        if (!value.includes("@")) {
                            this.errors[key] = `${key} harus berupa email yang valid`;
                        }
                        break;
                    case "number":
                        if (isNaN(value)) {
                            this.errors[key] = `${key} harus berupa angka`;
                        } else if (rule.min && value < rule.min!!) {
                            this.errors[key] = `${key} harus paling kecil ${rule.min}`;
                        } else if (rule.max && value > rule.max!!) {
                            this.errors[key] = `${key} harus paling tinggi ${rule.max}`;
                        } else {
                            // [OK] Validated
                            this.validatedData[key] = +value
                        }
                        break;
                    case "timestamp":
                        this.vrDate(key, 'timestamp')
                        break;
                    case "datetime":
                        this.vrDate(key, 'datetime')
                        break;
                    case "array":
                        if (!Array.isArray(value)) {
                            this.errors[key] = `${key} harus berupa array`;
                        }
                        break;
                }

                if (!this.validatedData[key] && rule.customRule && rule.customRule!!(value) !== null) {
                    this.errors[key] = rule.customRule!!(value)!!
                }
            }

            if (!this.validatedData[key]) {
                this.validatedData[key] = value;
            }
        }

        // console.log(this.validatedData)
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
        return new Validation(req.body, rules).validate();
    }

    static query(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.query as { [key: string]: string }, rules).validate();
    }

    static params(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.params, rules).validate();
    }
}

interface ValidationRule {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    in?: any[];
    type?: "email" | "number" | "datetime" | "timestamp" | "array";
    min?: number;
    max?: number;
    minDate?: Date | moment.Moment | string;
    maxDate?: Date | moment.Moment | string;
    customRule?: (value: any) => string | null
}

interface KeyValue<T> {
    [key: string]: T
}