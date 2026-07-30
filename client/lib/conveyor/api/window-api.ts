import { ConveyorApi } from "@/lib/preload/shared";

export class WindowApi extends ConveyorApi {
  // Generate window methods
  windowInit = () => this.invoke("window-init");
  windowClose = () => this.invoke("window-close");
  windowApplyPlacement = (placement: "center" | "center-above" | "center-below" | "cursor") =>
    this.invoke("window-apply-placement", placement);

  // Generate web methods
  webUndo = () => this.invoke("web-undo");
  webRedo = () => this.invoke("web-redo");
  webCut = () => this.invoke("web-cut");
  webCopy = () => this.invoke("web-copy");
  webPaste = () => this.invoke("web-paste");
  webDelete = () => this.invoke("web-delete");
  webSelectAll = () => this.invoke("web-select-all");
  webOpenUrl = (url: string) => this.invoke("web-open-url", url);
}
