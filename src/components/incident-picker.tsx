import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { categories, categoryKeys, type Category } from "../lib/incidents";
import { IncidentIcon } from "./incident-icon";
import { usePanelViewport } from "./use-panel-viewport";

const collator = new Intl.Collator("pt-BR");
const incidentTypes = [...categoryKeys].sort((a, b) => collator.compare(categories[a].label, categories[b].label));

function searchText(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

export function IncidentPicker({ saving, onSelect, onClose }: {
  saving: Category | null;
  onSelect: (category: Category) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const normalizedQuery = searchText(query.trim());
  const results = incidentTypes.filter(category => searchText(categories[category].label).includes(normalizedQuery));

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  usePanelViewport(panel);

  function updateQuery(value: string) {
    setQuery(value);
    if (list.current) list.current.scrollTop = 0;
  }

  return <section className="action-sheet incident-picker" aria-labelledby="category-heading" tabIndex={-1} ref={panel}>
    <div className="sheet-header">
      <div><h2 id="category-heading">O que aconteceu?</h2><p>Toque no tipo para registrar neste ponto.</p></div>
      <button type="button" className="close-button" aria-label="Cancelar registro" disabled={Boolean(saving)} onClick={onClose}><X size={20} /></button>
    </div>
    <div className="incident-search">
      <Search size={19} aria-hidden="true" />
      <input ref={search} type="search" aria-label="Buscar tipo de ocorrência" placeholder="Buscar tipo de ocorrência"
        value={query} onChange={event => updateQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            event.stopPropagation();
            updateQuery("");
          }
        }} />
      {query && <button type="button" aria-label="Limpar busca" onClick={() => { updateQuery(""); search.current?.focus(); }}>
        <X size={16} />
      </button>}
    </div>
    <ul className="incident-options" aria-label="Tipos de ocorrência" aria-busy={Boolean(saving)} ref={list}>
      {results.map(category => <li key={category}>
        <button type="button" onClick={() => { search.current?.blur(); onSelect(category); }} disabled={Boolean(saving)}>
          {saving === category ? <span className="category-glyph all-glyph"><LoaderCircle className="spinner" size={21} /></span> :
            <IncidentIcon category={category} size={21} />}
          <span>{categories[category].label}</span>
        </button>
      </li>)}
    </ul>
    {results.length === 0 && <p className="incident-no-results" role="status">Nenhum tipo encontrado.</p>}
    {saving && <span className="sr-only" role="status">Registrando ocorrência</span>}
  </section>;
}
