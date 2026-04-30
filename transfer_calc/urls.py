from django.urls import path
from . import views

app_name = "transfer_calc"

urlpatterns = [
    path('', views.index, name="index"),
]
