
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceFilteredSearchResults } from '../../../src/ui/react/trace/TraceFilteredSearchResults'
import { generateTestLogFetch } from '../../../src/ui/react/trace/testing/testLogFetch'


const testLogFetch = generateTestLogFetch();


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Trace Filtered Search Results</h1>
            <TraceFilteredSearchResults tracesSource={testLogFetch} />
        </div>
    </StrictMode>,
  )
  
