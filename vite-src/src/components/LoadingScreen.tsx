import "./LoadingScreen.css";

export default function LoadingScreen() {
  return (
    <div className="loadingScreen">
      <img src="./takeout.svg" alt="" className="loadingLogo" />
      <div className="loadingSpinner" />
      <span className="loadingText">Loading...</span>
    </div>
  );
}
