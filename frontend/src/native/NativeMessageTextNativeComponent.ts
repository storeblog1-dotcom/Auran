import type { HostComponent, ViewProps } from "react-native";
import type {
  Double,
  Int32,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";
import codegenNativeComponent from "react-native/Libraries/Utilities/codegenNativeComponent";

export interface NativeProps extends ViewProps {
  text: string;
  color?: string;
  fontSize?: Double;
  lineHeight?: Double;
  selectable?: WithDefault<boolean, false>;
  maxLines?: Int32;
  includeFontPadding?: WithDefault<boolean, true>;
  breakStrategy?: WithDefault<string, "simple">;
  hyphenationFrequency?: WithDefault<string, "none">;
}

export default codegenNativeComponent<NativeProps>(
  "NativeMessageText"
) as HostComponent<NativeProps>;
