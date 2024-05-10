import PhoneInput, { type Value } from 'react-phone-number-input'
import '../FormPhoneInput/FormPhoneInput.css'

interface Props {
    label: string
    name: string
    onChange: (value?: Value | undefined) => void
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
    value?: Value
    error?: string
}
export default function FormPhoneInput({ onChange, error, value,  label, name }: Props) {
 return (
     <div className="mb-2">
         <label
             htmlFor={name}
             className="block text-sm font-semibold text-gray-800"
         >
             {label}
         </label>
         <PhoneInput
             international
             placeholder="Enter phone number"
             value={value}
             onChange={onChange}
         />
         { error && <p className="text-red-500">{error}</p> }
     </div>
 );
};
