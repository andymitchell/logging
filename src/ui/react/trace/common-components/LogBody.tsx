import type { TLogBody } from "../../types.ts"

type LogBodyProps = {
    body: TLogBody
}
export const LogBody: React.FC<LogBodyProps> = ({ body }) => {
    return (<div style={{display: 'inline-block'}}>
        <div>
            {body.message}
        </div>
        <div style={{ fontSize: "0.8em", opacity: "0.9" }}>
            <span data-timestamp={body.timestamp} >{prettyDate(new Date(body.timestamp))}</span>
            <span style={{display:'inline-block', width: '30px'}}>&nbsp;</span>
            <span>{body.trace_id}</span>
        </div>
         
    </div>)
}

const prettyDate = (d: Date) => d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});