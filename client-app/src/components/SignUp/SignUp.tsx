import FormInput from "../FormInput/FormInput.tsx";
import {Formik} from "formik";
import {SignUpForm} from "../../types/signup.ts";
import {stringValidation} from "../../utils/validation.ts";
import  { type Value } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import FormPhoneInput from "../FormPhoneInput/FormPhoneInput.tsx";
import {Config} from "../../types/config.ts";

const config = await fetch('./config.json').then((response) => response.json())
    .catch(() => ({ error: 'Could not load config' })) as Config;


export default function SignUp() {

    const onSubmit = async (values: SignUpForm, {setSubmitting}: { setSubmitting: (isSubmitting: boolean) => void }) => {
        const params = new URLSearchParams(window.location.search)
        const token = params.get('x-amzn-marketplace-token')
        // TODO: Send to server
        console.log('values', values, token, config.apiUrl)
        await fetch(`${config.apiUrl}/register`, {
            method: "POST",
            body: JSON.stringify({
                regToken: token,
                contactPerson: values.name,
                contactPhone: values.phone,
                contactEmail: values.email
            })
        })
        setSubmitting(false);
    }


    return (
        <div>
            <div className="relative flex flex-col justify-center min-h-screen overflow-hidden">
                <div
                    className="w-full p-6 m-auto bg-white rounded-md shadow-xl ring-2 ring-indigo-600 lg:max-w-xl">
                    <h1 className="text-3xl font-semibold text-center text-indigo-700 uppercase mb-2">
                        Sign UP
                    </h1>
                    <p>Please enter your contact details</p>
                    <Formik
                        validateOnChange={false}
                        validateOnBlur={false}
                        initialValues={{email: '', name: '', phone: ''}}
                        validate={stringValidation}
                        onSubmit={onSubmit}
                    >
                        {({
                              values,
                              errors,
                              handleChange,
                              handleBlur,
                              handleSubmit,
                              isSubmitting,
                              setFieldValue
                          }) => (
                            <form onSubmit={handleSubmit} className="mt-6">
                                <FormInput label='Contact person name'
                                           name='name'
                                           onChange={handleChange}
                                           onBlur={handleBlur}
                                           error={errors.name}
                                           value={values.name}
                                />
                                <FormInput label='Email address'
                                           name='email'
                                           onChange={handleChange}
                                           onBlur={handleBlur}
                                           value={values.email}
                                           error={errors.email}
                                />
                                <FormPhoneInput
                                    name='phone'
                                    label='Phone number'
                                    value={values.phone as Value}
                                    onChange={(phoneValue) => {
                                        setFieldValue('phone', phoneValue)
                                    }}
                                    error={errors.phone}
                                />
                                <button
                                    disabled={isSubmitting}
                                    className="w-full mt-2 px-4 py-2 disabled:opacity-30 tracking-wide text-white transition-colors duration-200 transform bg-indigo-700 rounded-md hover:bg-indigo-600 focus:outline-none focus:bg-indigo-600">
                                    Sign up
                                </button>
                            </form>
                        )}
                    </Formik>
                </div>
            </div>
        </div>
    );
};
