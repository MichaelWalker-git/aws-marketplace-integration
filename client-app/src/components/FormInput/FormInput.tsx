
interface Props {
  label: string
  name: string
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  value?: string
  type?: string
  error?: string
}
export default function FormInput({ label, name, onChange, onBlur, type, error, value }: Props) {

 return (
     <div className="mb-2">
         <label
             htmlFor={name}
             className="block text-sm font-semibold text-gray-800"
         >
             {label}
         </label>
         <input
             type={type}
             value={value}
             onBlur={onBlur}
             onChange={onChange}
             name={name}
             className={`block w-full px-4 py-2 mt-2 bg-white border ${error && 'border-red-500'} rounded-md focus:border-indigo-400 focus:ring-indigo-300 focus:outline-none focus:ring focus:ring-opacity-40`}
         />
         { error && <p className="text-red-500">{error}</p> }
     </div>
 );
};
