package com.anonymous.frontend

import android.content.res.Configuration
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class SystemFontWeightModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SystemFontWeightModule"

  @ReactMethod
  fun getSystemFontWeight(promise: Promise) {
    val isBoldTextEnabled =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val adjustment = reactApplicationContext.resources.configuration.fontWeightAdjustment
        adjustment != Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED && adjustment > 0
      } else {
        false
      }

    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("isBoldTextEnabled", isBoldTextEnabled)
      },
    )
  }
}

class SystemFontWeightPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(SystemFontWeightModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
