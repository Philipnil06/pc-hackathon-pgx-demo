import { useEffect } from "react";
import { launch } from "../auth/smart";

export function LaunchPage() {
  useEffect(() => {
    launch();
  }, []);
  return <p>Starting SMART launch...</p>;
}
