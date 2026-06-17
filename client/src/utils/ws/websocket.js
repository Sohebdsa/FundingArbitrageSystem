export default function attachHandlers(ws, setTrade) {

  ws.onopen = () => {
    console.log("Connected");
  };

  ws.onmessage = (event) => {
    setTrade(JSON.parse(event.data));
  };

  ws.onclose = () => {
    console.log("Disconnected");
  };

}