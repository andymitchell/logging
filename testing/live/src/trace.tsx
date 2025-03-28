
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceView } from '../../../src/ui/react/trace/TraceView'
import { generateTestLogFetch } from '../../../src/ui/react/trace/testing/testLogFetch';



const testLogFetch = generateTestLogFetch();

const result = await testLogFetch();
const traceId = result[0].id;


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Trace View</h1>
            <TraceView traceId={traceId} tracesSource={testLogFetch} />
        </div>
    </StrictMode>,
  )
  
