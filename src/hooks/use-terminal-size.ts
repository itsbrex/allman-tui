import { useStdout } from "ink";
import { useEffect, useState } from "react";

/** Track the terminal's size, re-rendering on resize. */
export function useTerminalSize(): { cols: number; rows: number } {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout.columns || 120);
  const [rows, setRows] = useState(stdout.rows || 36);

  useEffect(() => {
    const onResize = () => {
      setCols(stdout.columns || 120);
      setRows(stdout.rows || 36);
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return { cols, rows };
}
