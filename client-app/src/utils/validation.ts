import {SignUpErrors, SignUpForm} from "../types/signup.ts";

export const stringValidation = (values: SignUpForm) => {
    const errors: SignUpErrors = {};
    if (!values.email) {
        errors.email = 'Required';
    } else if (
        !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)
    ) {
        errors.email = 'Invalid email address';
    }

    if (values.phone && values.phone.length > 26) {
        errors.phone = 'Phone number is too long';
    }

    if (values.name && values.name.length > 50) {
        errors.name = 'Name is too long';
    }
    return errors;
}
