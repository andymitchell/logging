
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceSearch } from '../../../src/ui/react/trace/TraceSearch'
import { generateTestLogFetch } from '../../../src/ui/react/trace/testing/testLogFetch';





const testLogFetch = generateTestLogFetch();


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Trace Search</h1>
            <TraceSearch tracesSource={testLogFetch} template='neutral' />
        </div>
    </StrictMode>,
  )
  
