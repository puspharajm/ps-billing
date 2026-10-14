import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Search or select...',
  className = 'form-control',
  disabled = false,
  required = false,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find(option => option.value === value);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search
      ? options.filter(option => option.label.toLocaleLowerCase().includes(search))
      : options;
  }, [options, query]);

  const close = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="searchable-select">
      <div className="searchable-select-control">
        <Search size={15} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className={className}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={isOpen ? query : selectedOption?.label ?? ''}
          disabled={disabled}
          required={required && !value}
          onFocus={() => setIsOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setIsOpen(true);
            onChange('');
            event.currentTarget.setCustomValidity(required && event.target.value ? 'Select a saved option from the list.' : '');
          }}
          onBlur={close}
          onKeyDown={event => {
            if (event.key === 'Escape') close();
            if (event.key === 'Enter' && isOpen && filteredOptions.length === 1) {
              event.preventDefault();
              onChange(filteredOptions[0].value);
              inputRef.current?.setCustomValidity('');
              close();
            }
          }}
        />
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      {isOpen && (
        <div className="searchable-select-options" role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`searchable-select-option${option.value === value ? ' selected' : ''}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                inputRef.current?.setCustomValidity('');
                close();
              }}
            >
              {option.label}
            </button>
          )) : (
            <div className="searchable-select-empty">No saved matches</div>
          )}
        </div>
      )}
    </div>
  );
}
