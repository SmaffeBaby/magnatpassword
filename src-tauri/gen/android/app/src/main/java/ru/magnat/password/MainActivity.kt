package ru.magnat.password

import android.os.Bundle
import android.os.Build
import android.content.pm.PackageManager
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  private val localNetworkPermission = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    // Retry initial session restoration after Android grants LAN access.
    if (granted) recreate()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // This shell connects to the existing server on the local network.
    // Android 17+ requires explicit permission for apps targeting API 37.
    val permission = "android.permission.ACCESS_LOCAL_NETWORK"
    if (Build.VERSION.SDK_INT >= 37 &&
        ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED &&
        savedInstanceState == null) {
      localNetworkPermission.launch(permission)
    }
  }
}
