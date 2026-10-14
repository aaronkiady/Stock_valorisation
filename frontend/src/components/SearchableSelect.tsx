import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface Option {
  value: number | string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: number | string | undefined;
  onChange: (value: number | string | undefined) => void;
  onSearch?: (input: string) => void;  // 🔥 ajout
  placeholder?: string;
  label?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  error?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  onSearch,
  placeholder = 'Rechercher...',
  label,
  allowEmpty = true,
  disabled = false,
  error
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState<Option[]>(options);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onSearch) {
      onSearch(searchTerm);
      setFilteredOptions(options);
    } else {
      const filtered = searchTerm === ''
        ? options
        : options.filter(opt =>
            opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (opt.sublabel && opt.sublabel.toLowerCase().includes(searchTerm.toLowerCase()))
          );

      setFilteredOptions(filtered);
    }
  }, [searchTerm, options]);

  const selectedOption = options.find(opt => opt.value === value);

  const displayValue = selectedOption
    ? `${selectedOption.label}${selectedOption.sublabel ? ` - ${selectedOption.sublabel}` : ''}`
    : '';

  const handleSelect = (v: any) => {
    onChange(v);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          relative px-3 py-2 border rounded-lg flex justify-between items-center
          ${disabled ? 'bg-gray-100' : 'bg-white hover:border-blue-400 cursor-pointer'}
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {displayValue || placeholder}
        </span>

        <div className="flex items-center space-x-2">
          {value && allowEmpty && !disabled && (
            <X
              size={16}
              className="text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            />
          )}

          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
          >
            <path strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-96 overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                className="w-full pl-10 pr-3 py-2 border rounded-md"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500">
                Aucun résultat
              </div>
            ) : (
              filteredOptions.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className="px-4 py-2 cursor-pointer hover:bg-blue-50 border-b last:border-none"
                >
                  <div className="font-medium">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-sm text-gray-500">{opt.sublabel}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
